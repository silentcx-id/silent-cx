-- Fase 4: QC, revisi, benchmark kompetitor, laporan, dan tagihan tambahan kelebihan pembelian.
--
-- QC: admin menyetujui (lokasi dianggap sesuai), meminta revisi per pertanyaan (24 jam, maksimal 2 putaran),
-- atau menolak (fee: tanpa fee/reimburse, atau reimburse saja; tugas dibuka lagi untuk shopper lain).
-- Skor outlet = rata-rata kunjungan yang disetujui; skor proyek = rata-rata outlet client.
-- Laporan: draf disusun admin, isinya dibekukan saat terbit, proyek selesai, dan kelebihan pembelian
-- yang disetujui ditagihkan sebagai satu invoice tambahan.
-- Kompetitor: outlet dengan is_competitor = true, diisi client sesuai jumlah add-on. Shopper tidak diberi tahu,
-- dan foto kunjungan kompetitor tidak pernah masuk laporan.

-- ---------------------------------------------------------------------------
-- Kolom baru
-- ---------------------------------------------------------------------------

alter table public.audit_tasks
  add column qc_note text check (qc_note is null or char_length(qc_note) <= 500),
  add column revision_round integer not null default 0,
  -- Id pertanyaan yang dibuka lagi; '__purchase' = nominal pembelian dan struk.
  add column revision_questions text[] not null default '{}',
  add column revision_note text check (revision_note is null or char_length(revision_note) <= 500),
  add column revision_due timestamptz,
  add column revision_expired boolean not null default false,
  add column qc_decided_at timestamptz,
  add column qc_decided_by uuid references public.profiles (id) on delete set null,
  -- full = fee + reimburse; reimburse_only = hanya penggantian pembelian; none = tidak dibayar.
  add column fee_decision text check (fee_decision in ('full', 'reimburse_only', 'none')),
  add column excess_approved boolean,
  add column reopened_as uuid references public.audit_tasks (id) on delete set null;

alter table public.project_outlets
  add column is_competitor boolean not null default false,
  -- Outlet client yang dijadikan pasangan langsung untuk kompetitor ini (opsional).
  add column paired_outlet_id uuid references public.project_outlets (id) on delete set null;

-- Satu proyek kini bisa punya invoice pesanan dan invoice tambahan (kelebihan pembelian).
alter table public.invoices add column kind text not null default 'order' check (kind in ('order', 'excess'));
alter table public.invoices drop constraint invoices_project_id_key;
create unique index invoices_order_idx on public.invoices (project_id) where kind = 'order';
create index invoices_project_idx on public.invoices (project_id);

create table public.reports (
  project_id uuid primary key references public.projects (id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'published')),
  summary text not null default '' check (char_length(summary) <= 4000),
  -- [{ title, detail, severity: critical|major|minor, outlet }]
  findings jsonb not null default '[]'::jsonb,
  -- [{ text, priority: now|soon|later }]
  recommendations jsonb not null default '[]'::jsonb,
  -- Foto kunjungan pilihan admin (tanpa foto kompetitor).
  photo_ids uuid[] not null default '{}',
  -- Angka laporan yang dibekukan saat terbit.
  data jsonb,
  published_at timestamptz,
  published_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger reports_touch before update on public.reports
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Invoice: hanya invoice pesanan yang mengubah status proyek atau bisa kedaluwarsa.
-- ---------------------------------------------------------------------------

create or replace function public.expire_overdue() returns integer
language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  with expired as (
    update public.invoices set status = 'expired'
    where status = 'unpaid' and kind = 'order' and due_at < now()
    returning project_id
  )
  update public.projects p set status = 'expired'
  from expired e
  where p.id = e.project_id and p.status = 'awaiting_payment';
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.submit_payment_proof(p_invoice uuid, p_method text, p_path text, p_amount integer, p_payer text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  inv public.invoices;
begin
  perform public.expire_overdue();
  select * into inv from public.invoices where id = p_invoice and client_id = auth.uid() for update;
  if not found then
    raise exception 'Invoice tidak ditemukan.' using errcode = 'P0002';
  end if;
  if inv.status = 'expired' then
    raise exception 'Invoice sudah kedaluwarsa. Silakan buat pesanan baru.' using errcode = '22023';
  end if;
  if inv.status <> 'unpaid' then
    raise exception 'Invoice ini tidak sedang menunggu pembayaran.' using errcode = '22023';
  end if;
  if p_method not in ('transfer', 'qris') then
    raise exception 'Metode pembayaran tidak valid.' using errcode = '22023';
  end if;
  if p_path is null or p_path not like auth.uid()::text || '/' || p_invoice::text || '/%' then
    raise exception 'File bukti tidak valid.' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Nominal yang dibayar wajib diisi.' using errcode = '22023';
  end if;

  insert into public.payment_proofs (invoice_id, method, file_path, payer_name, amount)
  values (p_invoice, p_method, p_path, left(btrim(coalesce(p_payer, '')), 120), p_amount);
  update public.invoices set status = 'verifying', status_note = null where id = p_invoice;
  if inv.kind = 'order' then
    update public.projects set status = 'verifying', status_note = null where id = inv.project_id;
  end if;

  perform public.log_activity('payment.submitted', 'invoice', p_invoice::text,
    jsonb_build_object('method', p_method, 'amount', p_amount, 'total', inv.total, 'kind', inv.kind));
end;
$$;

create or replace function public.admin_verify_payment(p_invoice uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  inv public.invoices;
  proof public.payment_proofs;
  note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa memverifikasi pembayaran.' using errcode = '42501';
  end if;
  select * into inv from public.invoices where id = p_invoice for update;
  if not found then
    raise exception 'Invoice tidak ditemukan.' using errcode = 'P0002';
  end if;
  if inv.status <> 'verifying' then
    raise exception 'Invoice ini tidak sedang menunggu verifikasi.' using errcode = '22023';
  end if;
  select * into proof from public.payment_proofs
  where invoice_id = p_invoice and status = 'pending' order by uploaded_at desc limit 1 for update;

  if p_approve then
    update public.payment_proofs set status = 'accepted', review_note = note, reviewed_at = now(), reviewed_by = auth.uid() where id = proof.id;
    update public.invoices set status = 'paid', paid_at = now(), status_note = note where id = p_invoice;
    if inv.kind = 'order' then
      update public.projects set status = 'active', activated_at = now(), status_note = note where id = inv.project_id;
    end if;
    perform public.log_activity('payment.verified', 'invoice', p_invoice::text, jsonb_build_object('proof', proof.id, 'note', note, 'kind', inv.kind));
  else
    if note is null then
      raise exception 'Alasan wajib diisi.' using errcode = '22023';
    end if;
    update public.payment_proofs set status = 'rejected', review_note = left(note, 500), reviewed_at = now(), reviewed_by = auth.uid() where id = proof.id;
    if inv.kind = 'order' then
      update public.invoices set status = 'unpaid', due_at = now() + interval '48 hours', status_note = left(note, 500) where id = p_invoice;
      update public.projects set status = 'awaiting_payment', status_note = left(note, 500) where id = inv.project_id;
    else
      update public.invoices set status = 'unpaid', status_note = left(note, 500) where id = p_invoice;
    end if;
    perform public.log_activity('payment.rejected', 'invoice', p_invoice::text, jsonb_build_object('proof', proof.id, 'note', note, 'kind', inv.kind));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Kompetitor (diisi client)
-- ---------------------------------------------------------------------------

-- Jumlah kompetitor yang dibeli lewat add-on benchmark kompetitor.
create or replace function public.competitor_allowance(p_project uuid)
returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(sum((a ->> 'quantity')::integer), 0)::integer
  from public.projects p, jsonb_array_elements(p.addons_snapshot) a
  where p.id = p_project and a ->> 'item_key' = 'competitor_benchmark';
$$;

-- Menyimpan daftar kompetitor: [{ name, address, city, maps_url, paired_outlet_id }], paling banyak sesuai add-on.
-- Kompetitor yang sudah dijadwalkan kunjungannya tidak bisa diubah atau dihapus.
create or replace function public.client_save_competitors(p_project uuid, p_items jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  proj public.projects;
  allowance integer;
  item jsonb;
  i integer := 0;
  pos integer;
  existing public.project_outlets;
  paired uuid;
  v_name text;
  v_address text;
  v_city text;
  v_maps text;
begin
  select * into proj from public.projects where id = p_project and client_id = auth.uid() for update;
  if not found then
    raise exception 'Proyek tidak ditemukan.' using errcode = 'P0002';
  end if;
  if proj.status <> 'active' then
    raise exception 'Kompetitor bisa diisi setelah pembayaran diverifikasi.' using errcode = '22023';
  end if;
  allowance := public.competitor_allowance(p_project);
  if allowance = 0 then
    raise exception 'Paket ini tidak termasuk benchmark kompetitor.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > allowance then
    raise exception 'Maksimal % kompetitor sesuai add-on yang dibeli.', allowance using errcode = '22023';
  end if;

  for item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    i := i + 1;
    pos := proj.outlet_count + i;
    v_name := left(btrim(coalesce(item ->> 'name', '')), 120);
    v_address := left(btrim(coalesce(item ->> 'address', '')), 300);
    v_city := left(btrim(coalesce(item ->> 'city', '')), 80);
    v_maps := btrim(coalesce(item ->> 'maps_url', ''));
    if char_length(v_city) < 2 then
      raise exception 'Isi kota kompetitor %.', i using errcode = '22023';
    end if;
    if v_maps <> '' and v_maps !~ '^https://' then
      raise exception 'Link Google Maps harus diawali https://' using errcode = '22023';
    end if;
    paired := nullif(item ->> 'paired_outlet_id', '')::uuid;
    if paired is not null and not exists (select 1 from public.project_outlets where id = paired and project_id = p_project and not is_competitor) then
      raise exception 'Outlet pasangan tidak valid.' using errcode = '22023';
    end if;

    select * into existing from public.project_outlets where project_id = p_project and position = pos;
    if found then
      if exists (select 1 from public.audit_tasks where outlet_id = existing.id and status <> 'cancelled')
         and (existing.name, existing.address, existing.city) is distinct from (v_name, v_address, v_city) then
        raise exception 'Kompetitor % sudah dijadwalkan dan tidak bisa diubah.', i using errcode = '22023';
      end if;
      update public.project_outlets set name = v_name, address = v_address, city = v_city, maps_url = v_maps, paired_outlet_id = paired
      where id = existing.id;
    else
      insert into public.project_outlets (project_id, position, city, name, address, maps_url, is_competitor, paired_outlet_id)
      values (p_project, pos, v_city, v_name, v_address, v_maps, true, paired);
    end if;
  end loop;

  -- Kompetitor yang dihapus dari daftar.
  if exists (select 1 from public.project_outlets o where o.project_id = p_project and o.is_competitor and o.position > proj.outlet_count + i
             and exists (select 1 from public.audit_tasks t where t.outlet_id = o.id and t.status <> 'cancelled')) then
    raise exception 'Kompetitor yang sudah dijadwalkan tidak bisa dihapus.' using errcode = '22023';
  end if;
  delete from public.project_outlets where project_id = p_project and is_competitor and position > proj.outlet_count + i;

  perform public.log_activity('project.competitors_saved', 'project', p_project::text, jsonb_build_object('count', i));
end;
$$;

-- Data lengkap kini juga mensyaratkan kompetitor terisi sesuai add-on.
create or replace function public.complete_project_details(p_project uuid, p_objectives text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  proj public.projects;
  comp public.companies;
  allowance integer;
begin
  select * into proj from public.projects where id = p_project and client_id = auth.uid() for update;
  if not found then
    raise exception 'Proyek tidak ditemukan.' using errcode = 'P0002';
  end if;
  if proj.status <> 'active' then
    raise exception 'Data hanya bisa dilengkapi setelah pembayaran diverifikasi.' using errcode = '22023';
  end if;
  select * into comp from public.companies where client_id = auth.uid();
  if not found or btrim(comp.name) = '' or btrim(comp.pic_name) = '' or btrim(comp.pic_phone) = '' then
    raise exception 'Lengkapi nama perusahaan, nama PIC, dan nomor PIC.' using errcode = '22023';
  end if;
  if exists (select 1 from public.project_outlets where project_id = p_project and (btrim(name) = '' or btrim(address) = '')) then
    raise exception 'Lengkapi nama dan alamat setiap outlet dan kompetitor.' using errcode = '22023';
  end if;
  allowance := public.competitor_allowance(p_project);
  if (select count(*) from public.project_outlets where project_id = p_project and is_competitor) < allowance then
    raise exception 'Isi % kompetitor sesuai add-on benchmark kompetitor.', allowance using errcode = '22023';
  end if;
  if char_length(coalesce(p_objectives, '')) > 2000 then
    raise exception 'Tujuan audit maksimal 2000 karakter.' using errcode = '22023';
  end if;

  update public.projects
  set objectives = btrim(coalesce(p_objectives, '')),
      details_completed_at = coalesce(details_completed_at, now())
  where id = p_project;
  perform public.log_activity('project.details_completed', 'project', p_project::text, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Tugas: status baru ikut dihitung di aturan Fase 3
-- ---------------------------------------------------------------------------

-- Tawaran kedaluwarsa (Fase 3), ditambah revisi yang lewat 24 jam kembali ke antrian QC untuk diputuskan admin.
create or replace function public.expire_offers() returns integer
language plpgsql security definer set search_path = public as $$
declare
  n integer := 0;
  r record;
begin
  for r in
    update public.task_offers set status = 'expired', responded_at = now()
    where status = 'offered' and respond_by < now()
    returning id, task_id, shopper_id
  loop
    update public.audit_tasks set status = 'open', shopper_id = null where id = r.task_id and status = 'offered';
    insert into public.activity_log (actor_id, action, target_type, target_id, detail)
    values (null, 'task.offer_expired', 'task', r.task_id::text, jsonb_build_object('shopper', r.shopper_id));
    n := n + 1;
  end loop;

  for r in
    update public.audit_tasks set status = 'submitted', revision_expired = true, revision_due = null
    where status = 'revision' and revision_due < now()
    returning id, shopper_id
  loop
    insert into public.activity_log (actor_id, action, target_type, target_id, detail)
    values (null, 'task.revision_expired', 'task', r.id::text, jsonb_build_object('shopper', r.shopper_id));
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.admin_assign_questionnaire(p_project uuid, p_questionnaire uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  proj public.projects;
  issues text[];
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa menetapkan kuesioner.' using errcode = '42501';
  end if;
  select * into proj from public.projects where id = p_project for update;
  if not found then
    raise exception 'Proyek tidak ditemukan.' using errcode = 'P0002';
  end if;
  if proj.status <> 'active' then
    raise exception 'Kuesioner hanya bisa ditetapkan ke proyek yang aktif.' using errcode = '22023';
  end if;
  if exists (select 1 from public.audit_tasks where project_id = p_project and status in ('in_progress', 'submitted', 'revision', 'approved', 'rejected')) then
    raise exception 'Kuesioner tidak bisa diganti karena sudah ada kunjungan yang dimulai.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.questionnaires where id = p_questionnaire and active) then
    raise exception 'Kuesioner tidak ditemukan atau nonaktif.' using errcode = 'P0002';
  end if;
  issues := public.questionnaire_issues(p_questionnaire);
  if cardinality(issues) > 0 then
    raise exception 'Kuesioner belum siap: %', array_to_string(issues, ' ') using errcode = '22023';
  end if;

  insert into public.project_questionnaires (project_id, questionnaire_id, snapshot, assigned_by)
  values (p_project, p_questionnaire, public.questionnaire_snapshot(p_questionnaire), auth.uid())
  on conflict (project_id) do update
    set questionnaire_id = excluded.questionnaire_id, snapshot = excluded.snapshot, assigned_at = now(), assigned_by = excluded.assigned_by;
  perform public.log_activity('project.questionnaire_assigned', 'project', p_project::text, jsonb_build_object('questionnaire', p_questionnaire));
end;
$$;

create or replace function public.admin_task_candidates(p_task uuid)
returns table (shopper_id uuid, full_name text, phone text, reaches_city boolean, active_tasks integer, same_outlet boolean, eligible boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  task public.audit_tasks;
  city text;
  max_active integer := public.field_setting('max_active_tasks', 3);
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa melihat calon shopper.' using errcode = '42501';
  end if;
  select * into task from public.audit_tasks where id = p_task;
  select o.city into city from public.project_outlets o where o.id = task.outlet_id;
  return query
  with c as (
    select p.id, p.full_name, p.phone,
           coalesce(lower(city) = any (select lower(x) from unnest(a.reachable_cities) x), false) as reaches,
           (select count(*)::integer from public.audit_tasks t where t.shopper_id = p.id and t.status in ('offered', 'accepted', 'in_progress', 'revision')) as active,
           exists (select 1 from public.audit_tasks t where t.outlet_id = task.outlet_id and t.shopper_id = p.id and t.id <> task.id and t.status <> 'cancelled') as same
    from public.profiles p
    left join public.shopper_applications a on a.shopper_id = p.id and a.status = 'approved'
    where p.role = 'shopper' and p.status = 'active'
  )
  select c.id, c.full_name, c.phone, c.reaches, c.active, c.same, (c.active < max_active and not c.same)
  from c
  order by (c.active < max_active and not c.same) desc, c.reaches desc, c.active, c.full_name;
end;
$$;

create or replace function public.admin_offer_task(p_task uuid, p_shopper uuid, p_hours integer default null, p_urgent boolean default false)
returns void
language plpgsql security definer set search_path = public as $$
declare
  task public.audit_tasks;
  outlet public.project_outlets;
  hours integer := coalesce(p_hours, public.field_setting('default_response_hours', 24));
  max_active integer := public.field_setting('max_active_tasks', 3);
  active integer;
  respond timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa menawarkan tugas.' using errcode = '42501';
  end if;
  perform public.expire_offers();
  select * into task from public.audit_tasks where id = p_task for update;
  if not found then
    raise exception 'Tugas tidak ditemukan.' using errcode = 'P0002';
  end if;
  if task.status <> 'open' then
    raise exception 'Tugas ini tidak sedang menunggu shopper.' using errcode = '22023';
  end if;
  if task.window_end < (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Jendela kunjungan tugas ini sudah lewat. Ubah jendelanya dulu.' using errcode = '22023';
  end if;
  if hours < 1 or hours > 168 then
    raise exception 'Batas respons 1 sampai 168 jam.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_shopper and role = 'shopper' and status = 'active') then
    raise exception 'Shopper tidak aktif.' using errcode = '22023';
  end if;
  select count(*) into active from public.audit_tasks where shopper_id = p_shopper and status in ('offered', 'accepted', 'in_progress', 'revision');
  if active >= max_active then
    raise exception 'Shopper ini sudah memegang % tugas aktif (maksimal %).', active, max_active using errcode = '22023';
  end if;
  if exists (select 1 from public.audit_tasks t where t.outlet_id = task.outlet_id and t.shopper_id = p_shopper and t.id <> task.id and t.status <> 'cancelled') then
    raise exception 'Shopper ini sudah pernah ditugaskan ke outlet yang sama di proyek ini.' using errcode = '22023';
  end if;

  respond := now() + make_interval(hours => hours);
  insert into public.task_offers (task_id, shopper_id, urgent, respond_by, created_by)
  values (task.id, p_shopper, coalesce(p_urgent, false), respond, auth.uid());
  update public.audit_tasks set status = 'offered', shopper_id = p_shopper where id = task.id;

  select * into outlet from public.project_outlets where id = task.outlet_id;
  perform public.notify(p_shopper, 'task.offered',
    jsonb_build_object('task', task.id, 'code', task.code, 'city', outlet.city, 'respond_by', respond, 'urgent', coalesce(p_urgent, false)));
  perform public.log_activity('task.offered', 'task', task.id::text,
    jsonb_build_object('shopper', p_shopper, 'hours', hours, 'urgent', coalesce(p_urgent, false)));
end;
$$;

create or replace function public.admin_cancel_task(p_task uuid, p_note text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  task public.audit_tasks;
  note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa membatalkan tugas.' using errcode = '42501';
  end if;
  select * into task from public.audit_tasks where id = p_task for update;
  if not found then
    raise exception 'Tugas tidak ditemukan.' using errcode = 'P0002';
  end if;
  if task.status in ('submitted', 'revision', 'approved', 'rejected', 'cancelled') then
    raise exception 'Tugas yang sudah disubmit, diperiksa, atau dibatalkan tidak bisa dibatalkan.' using errcode = '22023';
  end if;
  if note is null then
    raise exception 'Alasan wajib diisi.' using errcode = '22023';
  end if;
  update public.task_offers set status = 'withdrawn', responded_at = now() where task_id = task.id and status = 'offered';
  update public.audit_tasks set status = 'cancelled', cancel_note = left(note, 500) where id = task.id;
  if task.shopper_id is not null then
    perform public.notify(task.shopper_id, 'task.cancelled', jsonb_build_object('task', task.id, 'code', task.code, 'note', note));
  end if;
  perform public.log_activity('task.cancelled', 'task', task.id::text, jsonb_build_object('note', note, 'from', task.status));
end;
$$;

-- ---------------------------------------------------------------------------
-- QC (admin)
-- ---------------------------------------------------------------------------

create or replace function public.qc_task(p_task uuid)
returns public.audit_tasks
language plpgsql security definer set search_path = public as $$
declare
  task public.audit_tasks;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa melakukan QC.' using errcode = '42501';
  end if;
  select * into task from public.audit_tasks where id = p_task for update;
  if not found then
    raise exception 'Tugas tidak ditemukan.' using errcode = 'P0002';
  end if;
  if task.status <> 'submitted' then
    raise exception 'Kunjungan ini tidak sedang menunggu QC.' using errcode = '22023';
  end if;
  return task;
end;
$$;

-- Menyetujui kunjungan: lokasi dianggap sesuai, fee siap dibayar. Selisih pembelian disetujui atau tidak.
create or replace function public.admin_qc_approve(p_task uuid, p_excess boolean default false, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  task public.audit_tasks := public.qc_task(p_task);
  note text := left(nullif(btrim(coalesce(p_note, '')), ''), 500);
begin
  update public.audit_tasks set
    status = 'approved', qc_note = note, qc_decided_at = now(), qc_decided_by = auth.uid(),
    fee_decision = 'full',
    excess_approved = case when task.excess_amount > 0 then coalesce(p_excess, false) end,
    location_check = 'match', location_checked_at = coalesce(location_checked_at, now()), location_checked_by = coalesce(location_checked_by, auth.uid())
  where id = task.id;
  perform public.notify(task.shopper_id, 'task.approved', jsonb_build_object('task', task.id, 'code', task.code));
  perform public.log_activity('task.approved', 'task', task.id::text,
    jsonb_build_object('note', note, 'excess', task.excess_amount, 'excess_approved', case when task.excess_amount > 0 then coalesce(p_excess, false) end));
end;
$$;

-- Meminta revisi untuk pertanyaan tertentu (dan/atau '__purchase'), 24 jam, maksimal 2 putaran.
create or replace function public.admin_qc_revision(p_task uuid, p_items text[], p_note text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  task public.audit_tasks := public.qc_task(p_task);
  snap jsonb;
  item text;
  note text := nullif(btrim(coalesce(p_note, '')), '');
  due timestamptz := now() + interval '24 hours';
begin
  if task.revision_round >= 2 then
    raise exception 'Sudah 2 kali revisi. Setujui atau tolak kunjungan ini.' using errcode = '22023';
  end if;
  if p_items is null or cardinality(p_items) = 0 then
    raise exception 'Tandai minimal satu pertanyaan yang perlu direvisi.' using errcode = '22023';
  end if;
  if note is null then
    raise exception 'Tulis catatan revisi untuk shopper.' using errcode = '22023';
  end if;
  select snapshot into snap from public.project_questionnaires where project_id = task.project_id;
  foreach item in array p_items loop
    if item <> '__purchase' and public.snapshot_question(snap, item) is null then
      raise exception 'Pertanyaan tidak dikenal.' using errcode = '22023';
    end if;
  end loop;

  update public.audit_tasks set
    status = 'revision', revision_round = revision_round + 1, revision_questions = p_items,
    revision_note = left(note, 500), revision_due = due, revision_expired = false
  where id = task.id;
  perform public.notify(task.shopper_id, 'task.revision', jsonb_build_object('task', task.id, 'code', task.code, 'note', note, 'due', due));
  perform public.log_activity('task.revision_requested', 'task', task.id::text,
    jsonb_build_object('round', task.revision_round + 1, 'items', p_items, 'note', note));
end;
$$;

-- Menolak kunjungan. Fee: reimburse_only atau none. Dengan p_reopen, tugas yang sama dibuat lagi untuk shopper lain.
create or replace function public.admin_qc_reject(p_task uuid, p_fee text, p_note text, p_reopen boolean default true)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  task public.audit_tasks;
  note text := nullif(btrim(coalesce(p_note, '')), '');
  v_new uuid;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa melakukan QC.' using errcode = '42501';
  end if;
  select * into task from public.audit_tasks where id = p_task for update;
  if not found or task.status not in ('submitted', 'revision') then
    raise exception 'Kunjungan ini tidak sedang diperiksa.' using errcode = '22023';
  end if;
  if p_fee not in ('reimburse_only', 'none') then
    raise exception 'Pilih keputusan fee: reimburse saja atau tidak dibayar.' using errcode = '22023';
  end if;
  if note is null then
    raise exception 'Alasan wajib diisi.' using errcode = '22023';
  end if;

  if coalesce(p_reopen, true) then
    insert into public.audit_tasks (code, project_id, outlet_id, window_start, window_end, hours_start, hours_end,
                                    fee, reimburse_cap, scenario, mandatory_purchase, created_by)
    values (public.next_code('TGS'), task.project_id, task.outlet_id,
            greatest(task.window_start, (now() at time zone 'Asia/Jakarta')::date),
            greatest(task.window_end, (now() at time zone 'Asia/Jakarta')::date + 7),
            task.hours_start, task.hours_end, task.fee, task.reimburse_cap, task.scenario, task.mandatory_purchase, auth.uid())
    returning id into v_new;
  end if;

  update public.audit_tasks set
    status = 'rejected', qc_note = left(note, 500), qc_decided_at = now(), qc_decided_by = auth.uid(),
    fee_decision = p_fee, excess_approved = case when excess_amount > 0 then false end, reopened_as = v_new, revision_due = null
  where id = task.id;
  perform public.notify(task.shopper_id, 'task.rejected', jsonb_build_object('task', task.id, 'code', task.code, 'note', note, 'fee', p_fee));
  perform public.log_activity('task.rejected', 'task', task.id::text, jsonb_build_object('note', note, 'fee', p_fee, 'reopened_as', v_new));
  return v_new;
end;
$$;

-- Follow up revisi lewat WhatsApp. Mengembalikan nomor shopper.
create or replace function public.admin_record_revision_followup(p_task uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  task public.audit_tasks;
  v_phone text;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa follow up shopper.' using errcode = '42501';
  end if;
  select * into task from public.audit_tasks where id = p_task;
  if not found or task.status <> 'revision' then
    raise exception 'Kunjungan ini tidak sedang menunggu revisi.' using errcode = '22023';
  end if;
  select phone into v_phone from public.profiles where id = task.shopper_id;
  if v_phone is null then
    raise exception 'Shopper ini belum mengisi nomor WhatsApp.' using errcode = '22023';
  end if;
  perform public.log_activity('task.revision_followed_up', 'task', task.id::text, jsonb_build_object('shopper', task.shopper_id));
  return v_phone;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fungsi shopper (menggantikan versi Fase 3: revisi hanya membuka bagian yang ditandai)
-- ---------------------------------------------------------------------------

create or replace function public.shopper_save_visit(p_task uuid, p_answers jsonb, p_purchase integer default null, p_purchase_note text default '')
returns void
language plpgsql security definer set search_path = public as $$
declare
  task public.audit_tasks;
  snap jsonb;
  k text;
  a jsonb;
  q jsonb;
  val jsonb;
  v_answers jsonb := coalesce(p_answers, '{}'::jsonb);
  note text := left(btrim(coalesce(p_purchase_note, '')), 500);
begin
  task := public.my_task(p_task, array['in_progress', 'revision']::public.task_status[]);
  select snapshot into snap from public.project_questionnaires where project_id = task.project_id;
  if jsonb_typeof(v_answers) <> 'object' then
    raise exception 'Format jawaban tidak valid.' using errcode = '22023';
  end if;

  if task.status = 'revision' then
    for k in select key from jsonb_each(v_answers) union select key from jsonb_each(task.answers) loop
      if not k = any (task.revision_questions) and (v_answers -> k) is distinct from (task.answers -> k) then
        raise exception 'Hanya pertanyaan yang ditandai admin yang bisa diubah.' using errcode = '22023';
      end if;
    end loop;
    if not '__purchase' = any (task.revision_questions) and (p_purchase is distinct from task.purchase_amount or note is distinct from task.purchase_note) then
      raise exception 'Nominal pembelian tidak termasuk yang diminta direvisi.' using errcode = '22023';
    end if;
  end if;

  for k, a in select key, value from jsonb_each(v_answers) loop
    q := public.snapshot_question(snap, k);
    if q is null then
      raise exception 'Pertanyaan tidak dikenal.' using errcode = '22023';
    end if;
    if jsonb_typeof(a) <> 'object' then
      raise exception 'Format jawaban tidak valid.' using errcode = '22023';
    end if;
    if char_length(coalesce(a ->> 'note', '')) > 1000 then
      raise exception 'Catatan jawaban maksimal 1000 karakter.' using errcode = '22023';
    end if;
    val := a -> 'value';
    continue when val is null or jsonb_typeof(val) = 'null' or coalesce((a ->> 'na')::boolean, false);
    if (q ->> 'kind' = 'yes_no' and not (jsonb_typeof(val) = 'string' and val #>> '{}' in ('yes', 'no')))
       or (q ->> 'kind' = 'scale' and not (jsonb_typeof(val) = 'number' and val #>> '{}' ~ '^[1-5]$'))
       or (q ->> 'kind' = 'text' and not (jsonb_typeof(val) = 'string' and char_length(val #>> '{}') <= 2000)) then
      raise exception 'Jawaban untuk "%" tidak valid.', left(q ->> 'prompt', 60) using errcode = '22023';
    end if;
  end loop;

  if p_purchase is not null and (p_purchase < 0 or p_purchase > 100000000) then
    raise exception 'Nominal pembelian tidak valid.' using errcode = '22023';
  end if;
  update public.audit_tasks set answers = v_answers, purchase_amount = p_purchase, purchase_note = note where id = task.id;
end;
$$;

-- Saat revisi, foto hanya bisa ditambah atau dihapus untuk bagian yang ditandai.
create or replace function public.revision_allows(task public.audit_tasks, p_kind text, p_question text)
returns boolean
language sql immutable as $$
  select task.status = 'in_progress'
      or (p_kind = 'evidence' and p_question = any (task.revision_questions))
      or (p_kind = 'receipt' and '__purchase' = any (task.revision_questions));
$$;

create or replace function public.shopper_add_photo(p_task uuid, p_kind text, p_question text, p_path text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  task public.audit_tasks;
  snap jsonb;
  used integer;
  v_id uuid;
begin
  task := public.my_task(p_task, array['in_progress', 'revision']::public.task_status[]);
  select snapshot into snap from public.project_questionnaires where project_id = task.project_id;
  if p_kind not in ('receipt', 'evidence') then
    raise exception 'Jenis foto tidak valid.' using errcode = '22023';
  end if;
  if not public.revision_allows(task, p_kind, p_question) then
    raise exception 'Foto ini tidak termasuk yang diminta direvisi.' using errcode = '22023';
  end if;
  if p_path is null or p_path not like auth.uid()::text || '/' || task.id::text || '/%' then
    raise exception 'File foto tidak valid.' using errcode = '22023';
  end if;
  if p_kind = 'evidence' and public.snapshot_question(snap, p_question) is null then
    raise exception 'Pertanyaan tidak dikenal.' using errcode = '22023';
  end if;
  if p_kind = 'evidence' and exists (select 1 from public.visit_photos where task_id = task.id and kind = 'evidence' and question_id = p_question) then
    raise exception 'Pertanyaan ini sudah punya foto. Hapus dulu untuk mengganti.' using errcode = '22023';
  end if;
  select count(*) into used from public.visit_photos where task_id = task.id;
  if used >= (snap ->> 'photo_limit')::integer then
    raise exception 'Batas % foto per kunjungan sudah tercapai.', snap ->> 'photo_limit' using errcode = '22023';
  end if;
  insert into public.visit_photos (task_id, kind, question_id, path)
  values (task.id, p_kind, case when p_kind = 'evidence' then p_question end, p_path)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.shopper_remove_photo(p_photo uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  photo public.visit_photos;
  task public.audit_tasks;
begin
  select * into photo from public.visit_photos where id = p_photo;
  if not found then
    raise exception 'Foto tidak ditemukan.' using errcode = 'P0002';
  end if;
  task := public.my_task(photo.task_id, array['in_progress', 'revision']::public.task_status[]);
  if photo.kind = 'checkin' then
    raise exception 'Foto check-in tidak bisa dihapus.' using errcode = '22023';
  end if;
  if not public.revision_allows(task, photo.kind, photo.question_id) then
    raise exception 'Foto ini tidak termasuk yang diminta direvisi.' using errcode = '22023';
  end if;
  delete from public.visit_photos where id = photo.id;
  return photo.path;
end;
$$;

create or replace function public.shopper_submit_visit(p_task uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  task public.audit_tasks;
  snap jsonb;
  q jsonb;
  a jsonb;
  na boolean;
  missing integer := 0;
  missing_photo integer := 0;
  result jsonb;
begin
  task := public.my_task(p_task, array['in_progress', 'revision']::public.task_status[]);
  select snapshot into snap from public.project_questionnaires where project_id = task.project_id;

  for q in select x from jsonb_array_elements(snap -> 'sections') s, jsonb_array_elements(s -> 'questions') x loop
    a := task.answers -> (q ->> 'id');
    na := coalesce((a ->> 'na')::boolean, false);
    if a is null or (not na and (a -> 'value' is null or jsonb_typeof(a -> 'value') = 'null'
                                 or (q ->> 'kind' = 'text' and btrim(a ->> 'value') = ''))) then
      missing := missing + 1;
    elsif not na and (q ->> 'photo_required')::boolean
          and not exists (select 1 from public.visit_photos where task_id = task.id and kind = 'evidence' and question_id = q ->> 'id') then
      missing_photo := missing_photo + 1;
    end if;
  end loop;

  if missing > 0 then
    raise exception '% pertanyaan belum dijawab. Tandai "Tidak teramati" kalau memang tidak bisa diamati.', missing using errcode = '22023';
  end if;
  if missing_photo > 0 then
    raise exception '% pertanyaan wajib foto belum punya foto.', missing_photo using errcode = '22023';
  end if;
  if task.purchase_amount is null then
    raise exception 'Isi nominal pembelian (isi 0 kalau tidak membeli).' using errcode = '22023';
  end if;
  if task.purchase_amount > 0 and not exists (select 1 from public.visit_photos where task_id = task.id and kind = 'receipt') then
    raise exception 'Unggah foto struk pembelian.' using errcode = '22023';
  end if;

  result := public.visit_score(snap, task.answers);
  update public.audit_tasks set status = 'submitted', submitted_at = now(),
    score = (result ->> 'score')::numeric, section_scores = result -> 'sections',
    excess_amount = greatest(task.purchase_amount - task.reimburse_cap, 0),
    revision_due = null
  where id = task.id;
  perform public.log_activity(case when task.status = 'revision' then 'task.resubmitted' else 'task.submitted' end, 'task', task.id::text,
    jsonb_build_object('score', result -> 'score', 'purchase', task.purchase_amount, 'excess', greatest(task.purchase_amount - task.reimburse_cap, 0),
                       'round', task.revision_round));
  return result;
end;
$$;

create or replace function public.shopper_tasks()
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.expire_offers();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'code', t.code, 'status', t.status, 'city', o.city, 'outlet_name', o.name, 'address', o.address,
      'window_start', t.window_start, 'window_end', t.window_end, 'hours_start', t.hours_start, 'hours_end', t.hours_end,
      'fee', t.fee, 'respond_by', f.respond_by, 'urgent', coalesce(f.urgent, false), 'submitted_at', t.submitted_at,
      'revision_due', t.revision_due, 'qc_note', t.qc_note, 'fee_decision', t.fee_decision, 'qc_decided_at', t.qc_decided_at
    ) order by (t.status = 'revision') desc, coalesce(f.urgent, false) desc, t.status, t.window_start)
    from public.audit_tasks t
    join public.project_outlets o on o.id = t.outlet_id
    left join public.task_offers f on f.task_id = t.id and f.status = 'offered'
    where t.shopper_id = auth.uid() and t.status in ('offered', 'accepted', 'in_progress', 'submitted', 'revision', 'approved', 'rejected')
  ), '[]'::jsonb);
end;
$$;

create or replace function public.shopper_task(p_task uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t public.audit_tasks;
  o public.project_outlets;
  f public.task_offers;
  snap jsonb;
begin
  perform public.expire_offers();
  select * into t from public.audit_tasks where id = p_task and shopper_id = auth.uid()
    and status in ('offered', 'accepted', 'in_progress', 'submitted', 'revision', 'approved', 'rejected');
  if not found then
    return null;
  end if;
  select * into o from public.project_outlets where id = t.outlet_id;
  select * into f from public.task_offers where task_id = t.id and status = 'offered';
  if t.status <> 'offered' then
    select snapshot into snap from public.project_questionnaires where project_id = t.project_id;
  end if;
  return jsonb_build_object(
    'id', t.id, 'code', t.code, 'status', t.status,
    'outlet', jsonb_build_object('name', o.name, 'address', o.address, 'city', o.city, 'maps_url', o.maps_url),
    'window_start', t.window_start, 'window_end', t.window_end, 'hours_start', t.hours_start, 'hours_end', t.hours_end,
    'fee', t.fee, 'reimburse_cap', t.reimburse_cap, 'scenario', t.scenario, 'mandatory_purchase', t.mandatory_purchase,
    'respond_by', f.respond_by, 'urgent', coalesce(f.urgent, false),
    'checkin_at', t.checkin_at, 'answers', t.answers, 'purchase_amount', t.purchase_amount, 'purchase_note', t.purchase_note,
    'submitted_at', t.submitted_at,
    'revision', case when t.status = 'revision' then jsonb_build_object('items', t.revision_questions, 'note', t.revision_note, 'due', t.revision_due, 'round', t.revision_round) end,
    'qc', case when t.status in ('approved', 'rejected') then jsonb_build_object('note', t.qc_note, 'fee', t.fee_decision, 'decided_at', t.qc_decided_at) end,
    'questionnaire', case when snap is null then null else jsonb_build_object('photo_limit', snap -> 'photo_limit', 'sections', snap -> 'sections') end,
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'kind', p.kind, 'question_id', p.question_id, 'path', p.path) order by p.created_at)
                        from public.visit_photos p where p.task_id = t.id), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Client
-- ---------------------------------------------------------------------------

create or replace function public.client_audit_progress()
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'project_id', p.id, 'project_code', p.code, 'project_status', p.status, 'outlet_id', o.id, 'position', o.position, 'name', o.name, 'city', o.city,
    'is_competitor', o.is_competitor,
    'visits_planned', case when o.is_competitor then 1 else coalesce((p.package_snapshot ->> 'visits')::integer, 1) end,
    'scheduled', (select count(*) from public.audit_tasks t where t.outlet_id = o.id and t.status in ('open', 'offered', 'accepted', 'in_progress')),
    'awaiting_qc', (select count(*) from public.audit_tasks t where t.outlet_id = o.id and t.status in ('submitted', 'revision')),
    'approved', (select count(*) from public.audit_tasks t where t.outlet_id = o.id and t.status = 'approved')
  ) order by p.created_at desc, o.position), '[]'::jsonb)
  from public.projects p
  join public.project_outlets o on o.project_id = p.id
  where p.client_id = auth.uid() and p.status in ('active', 'reporting', 'completed');
$$;

-- ---------------------------------------------------------------------------
-- Laporan
-- ---------------------------------------------------------------------------

-- Angka laporan dari kunjungan yang disetujui: skor per area, per outlet, dan per kompetitor.
create or replace function public.project_report_data(p_project uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  proj public.projects;
  snap jsonb;
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa menyusun laporan.' using errcode = '42501';
  end if;
  select * into proj from public.projects where id = p_project;
  select snapshot into snap from public.project_questionnaires where project_id = p_project;

  with secs as (
    select s ->> 'id' as id, s ->> 'title' as title, coalesce((s ->> 'weight')::integer, 0) as weight, ord
    from jsonb_array_elements(coalesce(snap -> 'sections', '[]'::jsonb)) with ordinality as x(s, ord)
  ),
  visits as (
    select t.outlet_id, t.score, t.section_scores, t.checkin_at from public.audit_tasks t where t.project_id = p_project and t.status = 'approved'
  ),
  outlet_sec as (
    select v.outlet_id, secs.id, avg((v.section_scores ->> secs.id)::numeric) as score
    from visits v cross join secs group by v.outlet_id, secs.id
  ),
  outlet_rows as (
    select o.id, o.name, o.city, o.position, o.is_competitor,
           (select avg(v.score) from visits v where v.outlet_id = o.id) as score,
           (select count(*) from visits v where v.outlet_id = o.id) as visits,
           coalesce((select jsonb_agg(jsonb_build_object('title', secs.title, 'score', round(os.score, 1)) order by secs.ord)
                     from secs left join outlet_sec os on os.outlet_id = o.id and os.id = secs.id), '[]'::jsonb) as sections
    from public.project_outlets o where o.project_id = p_project
  )
  select jsonb_build_object(
    'code', proj.code,
    'company', coalesce(nullif((select name from public.companies where client_id = proj.client_id), ''), (select full_name from public.profiles where id = proj.client_id)),
    'packageName', proj.package_snapshot ->> 'name',
    'entitlements', to_jsonb(proj.entitlements),
    'outletCount', (select count(*) from outlet_rows where not is_competitor),
    'visitCount', (select count(*) from visits v join outlet_rows o on o.id = v.outlet_id where not o.is_competitor),
    'firstVisit', (select min(checkin_at) from visits),
    'lastVisit', (select max(checkin_at) from visits),
    'score', (select round(avg(score), 1) from outlet_rows where not is_competitor and score is not null),
    'sections', coalesce((select jsonb_agg(jsonb_build_object('title', secs.title, 'weight', secs.weight,
                 'score', (select round(avg(os.score), 1) from outlet_sec os join outlet_rows o on o.id = os.outlet_id where os.id = secs.id and not o.is_competitor)) order by secs.ord)
                 from secs where secs.weight > 0), '[]'::jsonb),
    'outlets', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'city', city, 'score', round(score, 1), 'visits', visits, 'sections', sections) order by position)
                from outlet_rows where not is_competitor), '[]'::jsonb),
    'competitors', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'city', city, 'score', round(score, 1), 'sections', sections) order by position)
                from outlet_rows where is_competitor), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

-- Menyimpan draf laporan. Foto hanya dari kunjungan yang disetujui ke outlet client (bukan kompetitor).
create or replace function public.admin_save_report(p_project uuid, p_summary text, p_findings jsonb, p_recommendations jsonb, p_photo_ids uuid[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  rep public.reports;
  x jsonb;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa menyusun laporan.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.projects where id = p_project and status in ('active', 'reporting', 'completed')) then
    raise exception 'Proyek tidak ditemukan atau belum aktif.' using errcode = 'P0002';
  end if;
  select * into rep from public.reports where project_id = p_project;
  if found and rep.status = 'published' then
    raise exception 'Laporan sudah terbit dan tidak bisa diubah.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_summary, '')) > 4000 then
    raise exception 'Ringkasan maksimal 4000 karakter.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_findings, '[]')) <> 'array' or jsonb_array_length(coalesce(p_findings, '[]')) > 20 then
    raise exception 'Maksimal 20 temuan.' using errcode = '22023';
  end if;
  for x in select * from jsonb_array_elements(coalesce(p_findings, '[]')) loop
    if char_length(btrim(coalesce(x ->> 'title', ''))) < 3 or char_length(x ->> 'title') > 200 or char_length(coalesce(x ->> 'detail', '')) > 1000
       or coalesce(x ->> 'severity', '') not in ('critical', 'major', 'minor') then
      raise exception 'Setiap temuan perlu judul (3–200 karakter), keterangan (maks. 1000), dan tingkat keparahan.' using errcode = '22023';
    end if;
  end loop;
  if jsonb_typeof(coalesce(p_recommendations, '[]')) <> 'array' or jsonb_array_length(coalesce(p_recommendations, '[]')) > 20 then
    raise exception 'Maksimal 20 rekomendasi.' using errcode = '22023';
  end if;
  for x in select * from jsonb_array_elements(coalesce(p_recommendations, '[]')) loop
    if char_length(btrim(coalesce(x ->> 'text', ''))) < 3 or char_length(x ->> 'text') > 500 or coalesce(x ->> 'priority', '') not in ('now', 'soon', 'later') then
      raise exception 'Setiap rekomendasi perlu teks (3–500 karakter) dan prioritas.' using errcode = '22023';
    end if;
  end loop;
  if cardinality(coalesce(p_photo_ids, '{}')) > 12 then
    raise exception 'Maksimal 12 foto di laporan.' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_photo_ids, '{}')) pid
    where not exists (
      select 1 from public.visit_photos ph
      join public.audit_tasks t on t.id = ph.task_id
      join public.project_outlets o on o.id = t.outlet_id
      where ph.id = pid and t.project_id = p_project and t.status = 'approved' and not o.is_competitor and ph.kind <> 'checkin'
    )
  ) then
    raise exception 'Foto laporan hanya dari kunjungan yang disetujui ke outlet client (bukan kompetitor, bukan foto check-in).' using errcode = '22023';
  end if;

  insert into public.reports (project_id, summary, findings, recommendations, photo_ids, updated_by)
  values (p_project, btrim(coalesce(p_summary, '')), coalesce(p_findings, '[]'), coalesce(p_recommendations, '[]'), coalesce(p_photo_ids, '{}'), auth.uid())
  on conflict (project_id) do update
    set summary = excluded.summary, findings = excluded.findings, recommendations = excluded.recommendations,
        photo_ids = excluded.photo_ids, updated_by = excluded.updated_by;
end;
$$;

-- Hal yang masih menghalangi laporan terbit. Kosong = siap terbit.
create or replace function public.report_blockers(p_project uuid)
returns text[]
language plpgsql stable security definer set search_path = public as $$
declare
  blockers text[] := '{}';
  rep public.reports;
  o record;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa menyusun laporan.' using errcode = '42501';
  end if;
  for o in select name, is_competitor from public.project_outlets x where x.project_id = p_project
           and not exists (select 1 from public.audit_tasks t where t.outlet_id = x.id and t.status = 'approved') order by position loop
    blockers := blockers || format('%s "%s" belum punya kunjungan yang disetujui.', case when o.is_competitor then 'Kompetitor' else 'Outlet' end, coalesce(nullif(o.name, ''), '—'));
  end loop;
  if exists (select 1 from public.audit_tasks where project_id = p_project and status in ('submitted', 'revision')) then
    blockers := blockers || 'Masih ada kunjungan yang menunggu QC atau revisi.'::text;
  end if;
  select * into rep from public.reports where project_id = p_project;
  if not found or btrim(rep.summary) = '' then
    blockers := blockers || 'Ringkasan belum diisi.'::text;
  end if;
  if not found or jsonb_array_length(rep.findings) = 0 then
    blockers := blockers || 'Belum ada temuan.'::text;
  end if;
  if not found or jsonb_array_length(rep.recommendations) = 0 then
    blockers := blockers || 'Belum ada rekomendasi.'::text;
  end if;
  return blockers;
end;
$$;

-- Menerbitkan laporan: angka dibekukan, proyek selesai, tagihan tambahan dibuat bila ada kelebihan pembelian yang disetujui.
create or replace function public.admin_publish_report(p_project uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  proj public.projects;
  blockers text[];
  v_invoice uuid;
  total integer;
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

  select coalesce(sum(excess_amount), 0) into total from public.audit_tasks where project_id = p_project and status = 'approved' and excess_approved;
  if total > 0 then
    insert into public.invoices (code, project_id, client_id, status, total, due_at, kind)
    values (public.next_code('INV'), p_project, proj.client_id, 'unpaid', total, now() + interval '7 days', 'excess')
    returning id into v_invoice;
    for t in select a.code, a.excess_amount from public.audit_tasks a where a.project_id = p_project and a.status = 'approved' and a.excess_approved order by a.code loop
      i := i + 1;
      insert into public.invoice_lines (invoice_id, position, kind, item_key, label, quantity, unit_price, amount, list_price)
      values (v_invoice, i, 'addon', 'excess_purchase', 'Kelebihan biaya pembelian kunjungan ' || t.code, 1, t.excess_amount, t.excess_amount, t.excess_amount);
    end loop;
    perform public.log_activity('invoice.excess_created', 'invoice', v_invoice::text, jsonb_build_object('project', p_project, 'total', total));
  end if;

  perform public.notify(proj.client_id, 'report.published', jsonb_build_object('project', p_project, 'code', proj.code, 'excess_invoice', v_invoice));
  perform public.log_activity('report.published', 'project', p_project::text, jsonb_build_object('excess_invoice', v_invoice, 'excess_total', total));
  return v_invoice;
end;
$$;

-- ---------------------------------------------------------------------------
-- Hak akses
-- ---------------------------------------------------------------------------

alter table public.reports enable row level security;
create policy "admin membaca laporan" on public.reports for select to authenticated using (public.is_admin());
create policy "client membaca laporan terbit" on public.reports for select to authenticated
  using (status = 'published' and exists (select 1 from public.projects p where p.id = project_id and p.client_id = auth.uid()));
revoke all on public.reports from anon;
revoke insert, update, delete on public.reports from authenticated;

revoke execute on function public.competitor_allowance(uuid) from public, anon;
grant execute on function public.competitor_allowance(uuid) to authenticated;
revoke execute on function public.client_save_competitors(uuid, jsonb) from public, anon;
grant execute on function public.client_save_competitors(uuid, jsonb) to authenticated;
revoke execute on function public.qc_task(uuid) from public, anon, authenticated;
revoke execute on function public.revision_allows(public.audit_tasks, text, text) from public, anon, authenticated;
revoke execute on function public.admin_qc_approve(uuid, boolean, text) from public, anon;
grant execute on function public.admin_qc_approve(uuid, boolean, text) to authenticated;
revoke execute on function public.admin_qc_revision(uuid, text[], text) from public, anon;
grant execute on function public.admin_qc_revision(uuid, text[], text) to authenticated;
revoke execute on function public.admin_qc_reject(uuid, text, text, boolean) from public, anon;
grant execute on function public.admin_qc_reject(uuid, text, text, boolean) to authenticated;
revoke execute on function public.admin_record_revision_followup(uuid) from public, anon;
grant execute on function public.admin_record_revision_followup(uuid) to authenticated;
revoke execute on function public.project_report_data(uuid) from public, anon;
grant execute on function public.project_report_data(uuid) to authenticated;
revoke execute on function public.admin_save_report(uuid, text, jsonb, jsonb, uuid[]) from public, anon;
grant execute on function public.admin_save_report(uuid, text, jsonb, jsonb, uuid[]) to authenticated;
revoke execute on function public.report_blockers(uuid) from public, anon;
grant execute on function public.report_blockers(uuid) to authenticated;
revoke execute on function public.admin_publish_report(uuid) from public, anon;
grant execute on function public.admin_publish_report(uuid) to authenticated;
