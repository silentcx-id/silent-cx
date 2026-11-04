-- Putaran 14: pembayaran DP, pelunasan saat laporan siap, laporan terkunci sampai lunas, dan rincian biaya add-on
-- tanpa harga pasti (misalnya Tugas luar kota).
--
-- 1. Client memilih cara bayar invoice pesanan paket: penuh, atau DP minimal 80% (persentase atau nominal).
--    Audit ulang dan konsultasi tambahan tetap bayar penuh.
-- 2. Saat laporan terbit, client DP mendapat tagihan Pelunasan: sisa pesanan ditambah kelebihan biaya belanja shopper
--    yang disetujui saat QC. Tanpa batas waktu. Client bayar penuh tetap mendapat tagihan kelebihan terpisah.
-- 3. Selama pelunasan belum lunas, client hanya melihat ringkasan laporan (skor keseluruhan, skor per outlet,
--    3 temuan teratas). Laporan lengkap, foto, dan PDF baru terbuka setelah pelunasan diverifikasi.
-- 4. Admin mengisi rincian biaya per outlet untuk add-on tanpa harga pasti (transportasi, penginapan, dan lain-lain).

-- ---------------------------------------------------------------------------
-- 1. Kolom
-- ---------------------------------------------------------------------------

-- DP yang dipilih client; kosong = bayar penuh. Hanya untuk invoice pesanan.
alter table public.invoices
  add column dp_amount integer check (dp_amount is null or dp_amount > 0),
  add constraint invoices_dp_order check (dp_amount is null or (kind = 'order' and dp_amount < total));

alter table public.invoices drop constraint invoices_kind_check;
alter table public.invoices add constraint invoices_kind_check check (kind in ('order', 'excess', 'consultation', 'settlement'));
create unique index invoices_settlement_idx on public.invoices (project_id) where kind = 'settlement';

-- Rincian biaya satu baris: [{ label, amount }], misalnya transportasi dan penginapan Tugas luar kota.
alter table public.invoice_lines
  add column details jsonb not null default '[]'::jsonb check (jsonb_typeof(details) = 'array');

alter table public.invoice_lines drop constraint invoice_lines_kind_check;
alter table public.invoice_lines add constraint invoice_lines_kind_check check (kind in ('package', 'addon', 'promo', 'settlement'));

-- ---------------------------------------------------------------------------
-- 2. Pilihan cara bayar
-- ---------------------------------------------------------------------------

-- DP minimal (80%, dibulatkan ke atas).
create or replace function public.dp_minimum(p_total integer) returns integer
language sql immutable as $$
  select ceil(p_total * 0.8)::integer;
$$;

-- p_dp kosong (atau sama dengan total) = bayar penuh. Bisa diganti selama bukti bayar belum diunggah.
create or replace function public.client_set_payment_plan(p_invoice uuid, p_dp integer default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  inv public.invoices;
  proj public.projects;
  v_dp integer;
begin
  select * into inv from public.invoices where id = p_invoice and client_id = auth.uid() for update;
  if not found then
    raise exception 'Invoice tidak ditemukan.' using errcode = 'P0002';
  end if;
  select * into proj from public.projects where id = inv.project_id;
  if inv.kind <> 'order' or proj.parent_project_id is not null then
    raise exception 'DP hanya untuk pesanan paket. Tagihan ini dibayar penuh.' using errcode = '22023';
  end if;
  if inv.status <> 'unpaid' then
    raise exception 'Cara bayar hanya bisa diganti sebelum bukti bayar diunggah.' using errcode = '22023';
  end if;
  v_dp := case when p_dp is null or p_dp >= inv.total then null else p_dp end;
  if v_dp is not null and v_dp < public.dp_minimum(inv.total) then
    raise exception 'DP minimal 80%% (%).', 'Rp' || public.rp_text(public.dp_minimum(inv.total)) using errcode = '22023';
  end if;
  update public.invoices set dp_amount = v_dp where id = inv.id;
  perform public.log_activity('invoice.payment_plan', 'invoice', inv.id::text, jsonb_build_object('dp', v_dp, 'total', inv.total));
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Rincian biaya add-on tanpa harga pasti
-- ---------------------------------------------------------------------------

-- Admin meninjau pesanan (dari 20261028000003). Harga setiap baris tanpa harga diisi angka, atau rincian per unit:
-- { "groups": [{ "name": "Medan", "items": [{ "label": "Transportasi", "amount": 250000 }] }] }.
-- Baris dengan jumlah lebih dari 1 dipecah menjadi satu baris per unit (misalnya per outlet), masing-masing
-- dengan rinciannya.
create or replace function public.admin_review_order(p_project uuid, p_approve boolean, p_note text default null, p_prices jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  proj public.projects;
  inv public.invoices;
  ln public.invoice_lines;
  entry jsonb;
  price integer;
  g jsonb;
  it jsonb;
  items jsonb;
  sum_amount integer;
  v_label text;
  v_name text;
  pos integer;
  k integer;
  n_groups integer;
  note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa meninjau pesanan.' using errcode = '42501';
  end if;
  select * into proj from public.projects where id = p_project for update;
  if not found then
    raise exception 'Pesanan tidak ditemukan.' using errcode = 'P0002';
  end if;
  if proj.status <> 'awaiting_review' then
    raise exception 'Pesanan ini tidak sedang menunggu tinjauan.' using errcode = '22023';
  end if;
  select * into inv from public.invoices where project_id = p_project and kind = 'order' for update;

  if not p_approve then
    if note is null then
      raise exception 'Alasan wajib diisi.' using errcode = '22023';
    end if;
    update public.projects set status = 'cancelled', status_note = left(note, 500) where id = p_project;
    update public.invoices set status = 'cancelled', status_note = left(note, 500) where id = inv.id;
    perform public.log_activity('order.cancelled', 'project', p_project::text, jsonb_build_object('note', note, 'stage', 'review'));
    return;
  end if;

  for ln in select * from public.invoice_lines where invoice_id = inv.id and amount is null order by position loop
    entry := p_prices -> ln.id::text;
    if entry is null or jsonb_typeof(entry) = 'null' then
      raise exception 'Harga untuk % wajib diisi.', ln.label using errcode = '22023';
    end if;

    if jsonb_typeof(entry) <> 'object' then
      price := (entry #>> '{}')::integer;
      if price is null or price < 0 then
        raise exception 'Harga untuk % wajib diisi.', ln.label using errcode = '22023';
      end if;
      update public.invoice_lines set unit_price = price, amount = price * ln.quantity, list_price = price where id = ln.id;
      continue;
    end if;

    n_groups := jsonb_array_length(coalesce(entry -> 'groups', '[]'::jsonb));
    if n_groups <> ln.quantity then
      raise exception 'Isi rincian biaya untuk setiap % (% rincian).', ln.label, ln.quantity using errcode = '22023';
    end if;
    -- Posisi baris dibaca ulang karena baris sebelumnya bisa sudah dipecah.
    select position into pos from public.invoice_lines where id = ln.id;
    if n_groups > 1 then
      update public.invoice_lines set position = position + 1000 where invoice_id = inv.id and position > pos;
    end if;
    k := 0;
    for g in select value from jsonb_array_elements(entry -> 'groups') loop
      items := '[]'::jsonb;
      sum_amount := 0;
      if jsonb_array_length(coalesce(g -> 'items', '[]'::jsonb)) = 0 or jsonb_array_length(g -> 'items') > 10 then
        raise exception 'Setiap rincian % berisi 1 sampai 10 biaya.', ln.label using errcode = '22023';
      end if;
      for it in select value from jsonb_array_elements(g -> 'items') loop
        v_label := left(btrim(coalesce(it ->> 'label', '')), 60);
        price := (it ->> 'amount')::integer;
        if v_label = '' or price is null or price < 0 then
          raise exception 'Isi nama dan jumlah setiap biaya untuk %.', ln.label using errcode = '22023';
        end if;
        items := items || jsonb_build_array(jsonb_build_object('label', v_label, 'amount', price));
        sum_amount := sum_amount + price;
      end loop;
      v_name := left(btrim(coalesce(g ->> 'name', '')), 60);
      v_label := left(ln.label || case when v_name <> '' then ' · ' || v_name else '' end, 200);
      if k = 0 then
        update public.invoice_lines
        set label = v_label, quantity = 1, unit_price = sum_amount, amount = sum_amount, list_price = sum_amount, details = items
        where id = ln.id;
      else
        insert into public.invoice_lines (invoice_id, position, kind, item_key, label, quantity, unit_price, amount, list_price, details)
        values (inv.id, pos + k, ln.kind, ln.item_key, v_label, 1, sum_amount, sum_amount, sum_amount, items);
      end if;
      k := k + 1;
    end loop;
    if n_groups > 1 then
      update public.invoice_lines set position = position - 1000 + (n_groups - 1) where invoice_id = inv.id and position > 1000;
    end if;
  end loop;

  update public.invoices
  set status = 'unpaid', due_at = now() + interval '48 hours', status_note = note,
      total = (select coalesce(sum(amount), 0) from public.invoice_lines where invoice_id = inv.id)
  where id = inv.id;
  update public.projects set status = 'awaiting_payment', status_note = note where id = p_project;

  perform public.log_activity('order.reviewed', 'project', p_project::text, jsonb_build_object('prices', p_prices, 'note', note));
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Pelunasan saat laporan terbit
-- ---------------------------------------------------------------------------

-- Menerbitkan laporan (dari 20261028000007). Client DP mendapat tagihan Pelunasan (sisa pesanan + kelebihan pembelian,
-- tanpa batas waktu); client bayar penuh mendapat tagihan kelebihan terpisah seperti sebelumnya.
create or replace function public.admin_publish_report(p_project uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  proj public.projects;
  ord public.invoices;
  blockers text[];
  v_invoice uuid;
  total integer;
  rest integer := 0;
  t record;
  i integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa menerbitkan laporan.' using errcode = '42501';
  end if;
  select * into proj from public.projects where id = p_project for update;
  if not found or proj.status not in ('active', 'reporting') then
    raise exception 'Proyek ini tidak bisa diterbitkan laporannya.' using errcode = '22023';
  end if;
  if exists (select 1 from public.reports where project_id = p_project and status = 'published') then
    raise exception 'Laporan sudah terbit.' using errcode = '22023';
  end if;
  blockers := public.report_blockers(p_project);
  if cardinality(blockers) > 0 then
    raise exception 'Laporan belum bisa terbit: %', array_to_string(blockers, ' ') using errcode = '22023';
  end if;

  update public.reports set status = 'published', data = public.project_report_data(p_project), published_at = now(), published_by = auth.uid()
  where project_id = p_project;
  update public.projects set status = 'completed' where id = p_project;
  -- Tugas yang belum berjalan tidak dibutuhkan lagi.
  update public.task_offers set status = 'withdrawn', responded_at = now()
  where status = 'offered' and task_id in (select id from public.audit_tasks where project_id = p_project and status = 'offered');
  update public.audit_tasks set status = 'cancelled', cancel_note = 'Laporan sudah terbit.'
  where project_id = p_project and status in ('open', 'offered', 'accepted');

  select * into ord from public.invoices where project_id = p_project and kind = 'order' and status = 'paid';
  if ord.dp_amount is not null then
    rest := ord.total - ord.dp_amount;
  end if;
  select coalesce(sum(excess_amount), 0) into total from public.audit_tasks where project_id = p_project and status = 'approved' and excess_approved;

  if rest > 0 then
    insert into public.invoices (code, project_id, client_id, status, total, due_at, kind)
    values (public.next_code('INV'), p_project, proj.client_id, 'unpaid', rest + total, null, 'settlement')
    returning id into v_invoice;
    i := 1;
    insert into public.invoice_lines (invoice_id, position, kind, item_key, label, quantity, unit_price, amount, list_price)
    values (v_invoice, i, 'settlement', 'settlement', 'Pelunasan pesanan ' || ord.code || ' (total ' || 'Rp' || public.rp_text(ord.total) || ', DP Rp' || public.rp_text(ord.dp_amount) || ')',
            1, rest, rest, rest);
  elsif total > 0 then
    insert into public.invoices (code, project_id, client_id, status, total, due_at, kind)
    values (public.next_code('INV'), p_project, proj.client_id, 'unpaid', total, now() + interval '7 days', 'excess')
    returning id into v_invoice;
  end if;
  if total > 0 then
    for t in select a.code, a.excess_amount from public.audit_tasks a where a.project_id = p_project and a.status = 'approved' and a.excess_approved order by a.code loop
      i := i + 1;
      insert into public.invoice_lines (invoice_id, position, kind, item_key, label, quantity, unit_price, amount, list_price)
      values (v_invoice, i, 'addon', 'excess_purchase', 'Kelebihan biaya pembelian kunjungan ' || t.code, 1, t.excess_amount, t.excess_amount, t.excess_amount);
    end loop;
    perform public.log_activity('invoice.excess_created', 'invoice', v_invoice::text, jsonb_build_object('project', p_project, 'total', total, 'settlement', rest > 0));
  end if;

  perform public.notify(proj.client_id, 'report.published',
    jsonb_build_object('project', p_project, 'code', proj.code, 'excess_invoice', v_invoice, 'locked', rest > 0, 'total', case when rest > 0 then rest + total end));
  perform public.log_activity('report.published', 'project', p_project::text,
    jsonb_build_object('excess_invoice', v_invoice, 'excess_total', total, 'settlement', rest));
  return v_invoice;
end;
$$;

-- Laporan terbuka penuh kalau tidak ada tagihan pelunasan yang belum lunas.
create or replace function public.report_unlocked(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.invoices where project_id = p_project and kind = 'settlement' and status not in ('paid', 'cancelled'));
$$;

drop policy "client membaca laporan terbit" on public.reports;
create policy "client membaca laporan terbit" on public.reports for select to authenticated
  using (status = 'published' and public.report_unlocked(project_id)
         and exists (select 1 from public.projects p where p.id = project_id and p.client_id = auth.uid()));

-- Ringkasan laporan yang masih terkunci: skor keseluruhan, skor per outlet, dan 3 temuan teratas. Null kalau proyek
-- bukan milik client, laporan belum terbit, atau laporan sudah terbuka penuh.
create or replace function public.client_report_preview(p_project uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  proj public.projects;
  rep public.reports;
  st public.invoices;
begin
  select * into proj from public.projects where id = p_project and client_id = auth.uid();
  if not found then
    return null;
  end if;
  select * into rep from public.reports where project_id = p_project and status = 'published';
  if not found or public.report_unlocked(p_project) then
    return null;
  end if;
  select * into st from public.invoices where project_id = p_project and kind = 'settlement';
  return jsonb_build_object(
    'project', p_project,
    'code', proj.code,
    'company', rep.data ->> 'company',
    'package', rep.data ->> 'packageName',
    'published_at', rep.published_at,
    'score', rep.data -> 'score',
    'outlets', coalesce((
      select jsonb_agg(jsonb_build_object('name', o.value ->> 'name', 'city', o.value ->> 'city', 'score', o.value -> 'score') order by o.ordinality)
      from jsonb_array_elements(coalesce(rep.data -> 'outlets', '[]'::jsonb)) with ordinality o
    ), '[]'::jsonb),
    'findings', coalesce((
      select jsonb_agg(f.value order by f.rank, f.ordinality)
      from (
        select value, ordinality, case value ->> 'severity' when 'critical' then 0 when 'major' then 1 else 2 end as rank
        from jsonb_array_elements(rep.findings) with ordinality
        order by rank, ordinality
        limit 3
      ) f
    ), '[]'::jsonb),
    'settlement', jsonb_build_object('id', st.id, 'code', st.code, 'total', st.total, 'status', st.status)
  );
end;
$$;

-- Daftar laporan terkunci milik client, untuk halaman Laporan.
create or replace function public.client_locked_reports()
returns table (project_id uuid, code text, package_name text, published_at timestamptz, score numeric, settlement_total integer, settlement_status public.invoice_status)
language sql stable security definer set search_path = public as $$
  select p.id, p.code, p.package_snapshot ->> 'name', r.published_at, (r.data ->> 'score')::numeric, i.total, i.status
  from public.projects p
  join public.reports r on r.project_id = p.id and r.status = 'published'
  join public.invoices i on i.project_id = p.id and i.kind = 'settlement' and i.status not in ('paid', 'cancelled')
  where p.client_id = auth.uid()
  order by r.published_at desc;
$$;

-- Pelunasan diverifikasi: laporan terbuka penuh dan client diberi tahu.
create or replace function public.notify_report_unlocked() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'settlement' and new.status = 'paid' and old.status is distinct from 'paid' then
    perform public.notify(new.client_id, 'report.unlocked',
      jsonb_build_object('project', new.project_id, 'code', (select code from public.projects where id = new.project_id), 'invoice', new.id));
  end if;
  return new;
end;
$$;

create trigger invoices_report_unlocked after update of status on public.invoices
  for each row execute function public.notify_report_unlocked();

-- ---------------------------------------------------------------------------
-- 5. Email dan hak akses
-- ---------------------------------------------------------------------------

-- Daftar ini sama dengan EMAIL_KINDS di src/lib/email-content.ts (dicek tes).
create or replace function public.is_email_kind(p_kind text) returns boolean
language sql immutable as $$
  select p_kind in (
    'task.offered', 'task.revision', 'application.approved', 'application.rejected', 'payout.paid',
    'order.ready', 'invoice.paid', 'invoice.rejected', 'invoice.due_soon', 'report.published',
    'admin.payment', 'chat.reply',
    'questionnaire.review', 'questionnaire.reminder', 'questionnaire.auto_approved', 'questionnaire.final',
    'admin.questionnaire_changes', 'account.email_changed', 'report.unlocked'
  );
$$;

revoke execute on function public.dp_minimum(integer) from public, anon;
grant execute on function public.dp_minimum(integer) to authenticated;
revoke execute on function public.client_set_payment_plan(uuid, integer) from public, anon;
grant execute on function public.client_set_payment_plan(uuid, integer) to authenticated;
revoke execute on function public.report_unlocked(uuid) from public, anon;
grant execute on function public.report_unlocked(uuid) to authenticated;
revoke execute on function public.client_report_preview(uuid) from public, anon;
grant execute on function public.client_report_preview(uuid) to authenticated;
revoke execute on function public.client_locked_reports() from public, anon;
grant execute on function public.client_locked_reports() to authenticated;
revoke execute on function public.notify_report_unlocked() from public, anon, authenticated;
