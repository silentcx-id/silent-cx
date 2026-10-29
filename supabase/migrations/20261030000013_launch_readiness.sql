-- Persiapan peluncuran: persetujuan Syarat & Kebijakan Privasi saat daftar, kotak keluar email notifikasi,
-- dan tugas terjadwal database (pg_cron).

-- 1. Persetujuan saat daftar. Versi dokumen (tanggal terakhir diperbarui) dikirim form daftar lewat metadata user
--    dan dicatat bersama waktunya. Pengguna tidak bisa mengubahnya sendiri (izin ubah profil hanya nama, nomor, bahasa).
alter table public.profiles
  add column terms_version text check (terms_version is null or char_length(terms_version) <= 120),
  add column terms_accepted_at timestamptz;

create or replace function public.record_signup_consent() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v text := nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'terms_version', '')), 120), '');
begin
  if v is not null then
    update public.profiles set terms_version = v, terms_accepted_at = now() where id = new.id;
    insert into public.activity_log (actor_id, action, target_type, target_id, detail)
    values (new.id, 'account.terms_accepted', 'profile', new.id::text, jsonb_build_object('version', v));
  end if;
  return new;
end;
$$;

revoke execute on function public.record_signup_consent() from public, anon, authenticated;

-- Nama trigger diurutkan setelah on_auth_user_created, jadi profilnya sudah ada.
create trigger on_auth_user_created_consent after insert on auth.users
  for each row execute function public.record_signup_consent();

-- 2. Kotak keluar email. Notifikasi penting untuk client dan shopper ditandai 'pending' saat dibuat; server aplikasi
--    (/api/email/dispatch) mengirimnya lewat Resend lalu menandainya 'sent', atau mencoba ulang sampai 3 kali.
--    Notifikasi lama dan notifikasi lain berstatus 'none' (tidak dikirim lewat email). Admin cukup lonceng.
alter table public.notifications
  add column email_status text not null default 'none' check (email_status in ('none', 'pending', 'sending', 'sent', 'failed', 'skipped')),
  add column email_attempts smallint not null default 0,
  add column email_error text check (email_error is null or char_length(email_error) <= 500),
  add column email_at timestamptz;

create index notifications_email_outbox_idx on public.notifications (id) where email_status in ('pending', 'sending');

-- Daftar ini sama dengan EMAIL_KINDS di src/lib/email-content.ts (dicek tes).
create or replace function public.is_email_kind(p_kind text) returns boolean
language sql immutable as $$
  select p_kind in (
    'task.offered', 'task.revision', 'application.approved', 'application.rejected', 'payout.paid',
    'order.ready', 'invoice.paid', 'invoice.rejected', 'invoice.due_soon', 'report.published'
  );
$$;

create or replace function public.queue_notification_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_email_kind(new.kind) and exists (select 1 from public.profiles where id = new.user_id and role <> 'admin') then
    new.email_status := 'pending';
  end if;
  return new;
end;
$$;

revoke execute on function public.queue_notification_email() from public, anon, authenticated;

create trigger notifications_queue_email before insert on public.notifications
  for each row execute function public.queue_notification_email();

-- Alamat dan kunci pemanggil /api/email/dispatch, diisi pemilik proyek lewat SQL Editor (lihat docs/SETUP.md).
-- Skema app_private tidak dibuka lewat API Supabase.
create schema if not exists app_private;
revoke all on schema app_private from public;
create table if not exists app_private.settings (key text primary key, value text not null);
revoke all on app_private.settings from public;

-- Memanggil server aplikasi hanya kalau ada email yang menunggu dan alamatnya sudah diisi.
create or replace function app_private.dispatch_emails() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_url text := (select value from app_private.settings where key = 'email_dispatch_url');
  v_secret text := (select value from app_private.settings where key = 'email_dispatch_secret');
begin
  if v_url is null or v_secret is null then
    return;
  end if;
  if not exists (select 1 from public.notifications where email_status in ('pending', 'sending')) then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

revoke execute on function app_private.dispatch_emails() from public;

-- 3. Tugas terjadwal (pg_cron): invoice lewat batas bayar, tawaran tugas lewat batas jawab, pengingat tagihan
--    jatuh tempo, dan pengiriman email. Dilewati di database tanpa pg_cron (misalnya database uji lokal).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('silentcx-expire', '*/5 * * * *', 'select public.expire_overdue(); select public.expire_offers();');
    perform cron.schedule('silentcx-invoice-reminders', '*/15 * * * *', 'select public.remind_due_invoices();');
    if exists (select 1 from pg_available_extensions where name = 'pg_net') then
      create extension if not exists pg_net;
      perform cron.schedule('silentcx-email', '* * * * *', 'select app_private.dispatch_emails();');
    end if;
  end if;
end;
$$;

-- 4. Mengganti bukti transfer payout tidak lagi menimpa catatan transfer asli: alasan penggantian disimpan terpisah.
alter table public.payouts
  add column replace_note text check (replace_note is null or char_length(replace_note) <= 500);

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
  update public.payouts set proof_path = p_proof, replace_note = v_note, proof_replaced_at = now() where id = po.id;
  perform public.notify(po.shopper_id, 'payout.proof_replaced', jsonb_build_object('payout', po.id, 'code', po.code, 'note', v_note));
  perform public.log_activity('payout.proof_replaced', 'payout', po.id::text,
    jsonb_build_object('code', po.code, 'note', v_note, 'old_proof', po.proof_path, 'old_replace_note', po.replace_note));
end;
$$;

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
        'paid_at', po.paid_at, 'note', po.note, 'replace_note', po.replace_note, 'proof_replaced_at', po.proof_replaced_at,
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
