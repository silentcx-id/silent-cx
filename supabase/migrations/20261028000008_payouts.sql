-- Fase 5: payout shopper.
--
-- Dibayar per tugas, paling lambat 48 jam setelah disetujui QC. Hitungan baru mulai setelah shopper
-- mengisi rekening; sebelum itu statusnya "menunggu rekening" dan shopper diberi notifikasi.
-- Isi: fee (kalau keputusan QC full) ditambah reimburse pembelian: sampai batas reimburse, atau seluruh
-- pembelian kalau kelebihannya disetujui admin. Kunjungan yang ditolak tanpa fee tidak ikut.
-- Admin boleh menggabungkan beberapa tugas dari satu shopper dalam satu transfer dengan satu bukti.
-- Shopper tetap dibayar walaupun tagihan tambahan client belum lunas.

-- ---------------------------------------------------------------------------
-- Tabel dan kolom
-- ---------------------------------------------------------------------------

-- Kapan rekening pertama kali diisi: awal hitungan 48 jam untuk tugas yang disetujui sebelum itu.
alter table public.shopper_bank_accounts add column created_at timestamptz not null default now();

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  shopper_id uuid not null references public.profiles (id) on delete restrict,
  fee_total integer not null check (fee_total >= 0),
  reimburse_total integer not null check (reimburse_total >= 0),
  total integer not null check (total > 0 and total = fee_total + reimburse_total),
  -- Rekening tujuan saat transfer, disalin supaya tidak berubah kalau shopper mengganti rekening.
  bank_name text not null,
  account_number text not null,
  account_holder text not null,
  proof_path text not null check (char_length(proof_path) between 1 and 300),
  note text check (note is null or char_length(note) <= 500),
  paid_at timestamptz not null default now(),
  paid_by uuid references public.profiles (id) on delete set null,
  proof_replaced_at timestamptz,
  created_at timestamptz not null default now()
);

create index payouts_shopper_idx on public.payouts (shopper_id, paid_at desc);

alter table public.audit_tasks
  add column payout_id uuid references public.payouts (id) on delete restrict,
  -- Nominal yang dibayarkan, dibekukan saat payout dicatat.
  add column payout_fee integer check (payout_fee >= 0),
  add column payout_reimburse integer check (payout_reimburse >= 0);

create index audit_tasks_payout_idx on public.audit_tasks (payout_id);

-- Kontak person admin yang dihubungi shopper kalau ada masalah pembayaran.
insert into public.app_settings (key, value) values
  ('admin_contact', jsonb_build_object('name', '', 'whatsapp', ''))
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Nominal
-- ---------------------------------------------------------------------------

create or replace function public.task_payout_fee(t public.audit_tasks) returns integer
language sql immutable as $$
  select case when t.status = 'approved' and t.fee_decision = 'full' then t.fee else 0 end;
$$;

create or replace function public.task_payout_reimburse(t public.audit_tasks) returns integer
language sql immutable as $$
  select case
    when (t.status = 'approved' and t.fee_decision = 'full') or (t.status = 'rejected' and t.fee_decision = 'reimburse_only') then
      case when coalesce(t.excess_approved, false) then coalesce(t.purchase_amount, 0)
           else least(coalesce(t.purchase_amount, 0), t.reimburse_cap) end
    else 0
  end;
$$;

-- Batas bayar: 48 jam sejak QC atau sejak rekening diisi, mana yang lebih akhir. Null = belum ada rekening.
create or replace function public.task_payout_due(t public.audit_tasks) returns timestamptz
language sql stable security definer set search_path = public as $$
  select greatest(t.qc_decided_at, b.created_at) + interval '48 hours'
  from public.shopper_bank_accounts b where b.shopper_id = t.shopper_id;
$$;

-- ---------------------------------------------------------------------------
-- Antrian admin
-- ---------------------------------------------------------------------------

-- Tugas yang belum dibayar, urut dari yang paling mendesak. Status: overdue, pending, waiting_bank.
create or replace function public.admin_payout_queue()
returns table (
  task_id uuid, code text, shopper_id uuid, shopper_name text, shopper_phone text,
  outlet_name text, city text, project_code text, task_status text,
  fee integer, reimburse integer, total integer, decided_at timestamptz, due_at timestamptz, payout_status text,
  bank_name text, account_number text, account_holder text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa melihat antrian payout.' using errcode = '42501';
  end if;
  return query
    select a.id, a.code, a.shopper_id, p.full_name, p.phone,
           o.name, o.city, pr.code, a.status::text,
           public.task_payout_fee(a), public.task_payout_reimburse(a),
           public.task_payout_fee(a) + public.task_payout_reimburse(a),
           a.qc_decided_at, d.due,
           case when b.shopper_id is null then 'waiting_bank' when d.due < now() then 'overdue' else 'pending' end,
           b.bank_name, b.account_number, b.account_holder
    from public.audit_tasks a
    join public.profiles p on p.id = a.shopper_id
    join public.project_outlets o on o.id = a.outlet_id
    join public.projects pr on pr.id = a.project_id
    left join public.shopper_bank_accounts b on b.shopper_id = a.shopper_id
    -- greatest() mengabaikan null, jadi tanpa rekening batasnya dikosongkan secara eksplisit.
    cross join lateral (select case when b.shopper_id is not null then greatest(a.qc_decided_at, b.created_at) + interval '48 hours' end as due) d
    where a.payout_id is null and a.status in ('approved', 'rejected')
      and public.task_payout_fee(a) + public.task_payout_reimburse(a) > 0
    order by (b.shopper_id is null), d.due nulls last, a.qc_decided_at;
end;
$$;

-- Mencatat satu transfer untuk satu atau beberapa tugas dari shopper yang sama.
create or replace function public.admin_record_payout(p_tasks uuid[], p_proof text, p_note text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_shopper uuid;
  v_count integer;
  v_shoppers integer;
  v_fee integer := 0;
  v_reimburse integer := 0;
  bank public.shopper_bank_accounts;
  v_id uuid;
  v_code text;
  v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 500);
  t public.audit_tasks;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa mencatat payout.' using errcode = '42501';
  end if;
  if p_tasks is null or cardinality(p_tasks) = 0 then
    raise exception 'Pilih minimal satu tugas.' using errcode = '22023';
  end if;
  -- Kunci tugasnya supaya tidak dibayar dua kali.
  perform 1 from public.audit_tasks where id = any (p_tasks) for update;
  select count(*), count(distinct shopper_id), min(shopper_id::text)::uuid into v_count, v_shoppers, v_shopper
  from public.audit_tasks where id = any (p_tasks);
  if v_count <> (select count(distinct x) from unnest(p_tasks) x) then
    raise exception 'Ada tugas yang tidak ditemukan.' using errcode = '22023';
  end if;
  if v_shoppers <> 1 or v_shopper is null then
    raise exception 'Satu transfer hanya untuk tugas dari shopper yang sama.' using errcode = '22023';
  end if;
  for t in select * from public.audit_tasks where id = any (p_tasks) loop
    if t.payout_id is not null then
      raise exception 'Tugas % sudah dibayar.', t.code using errcode = '22023';
    end if;
    if t.status not in ('approved', 'rejected') or public.task_payout_fee(t) + public.task_payout_reimburse(t) = 0 then
      raise exception 'Tugas % tidak punya fee atau reimburse yang perlu dibayar.', t.code using errcode = '22023';
    end if;
    v_fee := v_fee + public.task_payout_fee(t);
    v_reimburse := v_reimburse + public.task_payout_reimburse(t);
  end loop;
  select * into bank from public.shopper_bank_accounts where shopper_id = v_shopper;
  if not found then
    raise exception 'Shopper belum mengisi rekening.' using errcode = '22023';
  end if;
  if p_proof is null or p_proof not like v_shopper::text || '/%' or char_length(p_proof) > 300 then
    raise exception 'Unggah bukti transfer dulu.' using errcode = '22023';
  end if;

  v_code := public.next_code('PAY');
  insert into public.payouts (code, shopper_id, fee_total, reimburse_total, total, bank_name, account_number, account_holder, proof_path, note, paid_by)
  values (v_code, v_shopper, v_fee, v_reimburse, v_fee + v_reimburse, bank.bank_name, bank.account_number, bank.account_holder, p_proof, v_note, auth.uid())
  returning id into v_id;
  update public.audit_tasks a set payout_id = v_id, payout_fee = public.task_payout_fee(a), payout_reimburse = public.task_payout_reimburse(a)
  where a.id = any (p_tasks);

  perform public.notify(v_shopper, 'payout.paid', jsonb_build_object('payout', v_id, 'code', v_code, 'total', v_fee + v_reimburse));
  -- Nomor rekening tidak ikut dicatat di log.
  perform public.log_activity('payout.paid', 'payout', v_id::text,
    jsonb_build_object('code', v_code, 'shopper', v_shopper, 'tasks', to_jsonb(p_tasks), 'fee', v_fee, 'reimburse', v_reimburse, 'bank', bank.bank_name));
  return v_id;
end;
$$;

-- Mengganti bukti transfer yang salah. Catatan wajib; bukti lama tetap tercatat di log.
create or replace function public.admin_replace_payout_proof(p_payout uuid, p_proof text, p_note text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  po public.payouts;
  v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 500);
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa mengganti bukti transfer.' using errcode = '42501';
  end if;
  select * into po from public.payouts where id = p_payout for update;
  if not found then
    raise exception 'Payout tidak ditemukan.' using errcode = '22023';
  end if;
  if v_note is null then
    raise exception 'Tulis alasan penggantian bukti.' using errcode = '22023';
  end if;
  if p_proof is null or p_proof not like po.shopper_id::text || '/%' or char_length(p_proof) > 300 or p_proof = po.proof_path then
    raise exception 'Unggah bukti transfer yang baru.' using errcode = '22023';
  end if;
  update public.payouts set proof_path = p_proof, note = v_note, proof_replaced_at = now() where id = po.id;
  perform public.notify(po.shopper_id, 'payout.proof_replaced', jsonb_build_object('payout', po.id, 'code', po.code, 'note', v_note));
  perform public.log_activity('payout.proof_replaced', 'payout', po.id::text, jsonb_build_object('code', po.code, 'note', v_note, 'old_proof', po.proof_path));
end;
$$;

-- ---------------------------------------------------------------------------
-- Shopper
-- ---------------------------------------------------------------------------

-- Pembayaran milik shopper yang masuk: yang belum dibayar (dengan batas waktunya) dan yang sudah dibayar
-- beserta rincian per tugas. Nama client tidak ikut.
create or replace function public.shopper_payouts()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  has_bank boolean;
begin
  if me is null or not exists (select 1 from public.profiles where id = me and role = 'shopper') then
    raise exception 'Hanya shopper yang bisa melihat pembayarannya.' using errcode = '42501';
  end if;
  has_bank := exists (select 1 from public.shopper_bank_accounts where shopper_id = me);
  return jsonb_build_object(
    'has_bank', has_bank,
    'pending', coalesce((
      select jsonb_agg(jsonb_build_object(
        'task', a.id, 'code', a.code, 'outlet_name', o.name, 'city', o.city,
        'fee', public.task_payout_fee(a), 'reimburse', public.task_payout_reimburse(a),
        'decided_at', a.qc_decided_at, 'due_at', public.task_payout_due(a), 'overdue', coalesce(public.task_payout_due(a) < now(), false)
      ) order by a.qc_decided_at)
      from public.audit_tasks a join public.project_outlets o on o.id = a.outlet_id
      where a.shopper_id = me and a.payout_id is null and a.status in ('approved', 'rejected')
        and public.task_payout_fee(a) + public.task_payout_reimburse(a) > 0
    ), '[]'::jsonb),
    'paid', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', po.id, 'code', po.code, 'total', po.total, 'fee_total', po.fee_total, 'reimburse_total', po.reimburse_total,
        'bank_name', po.bank_name, 'account_number', po.account_number, 'account_holder', po.account_holder,
        'paid_at', po.paid_at, 'note', po.note, 'proof_replaced_at', po.proof_replaced_at,
        'items', (
          select jsonb_agg(jsonb_build_object('code', a.code, 'outlet_name', o.name, 'city', o.city, 'fee', a.payout_fee, 'reimburse', a.payout_reimburse) order by a.code)
          from public.audit_tasks a join public.project_outlets o on o.id = a.outlet_id where a.payout_id = po.id
        )
      ) order by po.paid_at desc)
      from public.payouts po where po.shopper_id = me
    ), '[]'::jsonb)
  );
end;
$$;

-- Tugas yang perlu dibayar tetapi shopper belum punya rekening: minta shopper mengisinya.
create or replace function public.payout_need_bank_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status in ('approved', 'rejected') and new.shopper_id is not null
     and public.task_payout_fee(new) + public.task_payout_reimburse(new) > 0
     and not exists (select 1 from public.shopper_bank_accounts where shopper_id = new.shopper_id) then
    perform public.notify(new.shopper_id, 'payout.need_bank', jsonb_build_object('task', new.id, 'code', new.code));
  end if;
  return new;
end;
$$;

create trigger audit_tasks_payout_need_bank after update of status on public.audit_tasks
  for each row execute function public.payout_need_bank_notify();

-- ---------------------------------------------------------------------------
-- Akses
-- ---------------------------------------------------------------------------

alter table public.payouts enable row level security;

create policy "admin membaca payout" on public.payouts for select to authenticated using (public.is_admin());
create policy "shopper membaca payoutnya" on public.payouts for select to authenticated using (shopper_id = auth.uid());

revoke all on public.payouts from anon;
revoke insert, update, delete on public.payouts from authenticated;

revoke execute on function public.task_payout_fee(public.audit_tasks) from public, anon, authenticated;
revoke execute on function public.task_payout_reimburse(public.audit_tasks) from public, anon, authenticated;
revoke execute on function public.task_payout_due(public.audit_tasks) from public, anon, authenticated;
revoke execute on function public.payout_need_bank_notify() from public, anon, authenticated;
revoke execute on function public.admin_payout_queue() from public, anon;
grant execute on function public.admin_payout_queue() to authenticated;
revoke execute on function public.admin_record_payout(uuid[], text, text) from public, anon;
grant execute on function public.admin_record_payout(uuid[], text, text) to authenticated;
revoke execute on function public.admin_replace_payout_proof(uuid, text, text) from public, anon;
grant execute on function public.admin_replace_payout_proof(uuid, text, text) to authenticated;
revoke execute on function public.shopper_payouts() from public, anon;
grant execute on function public.shopper_payouts() to authenticated;
