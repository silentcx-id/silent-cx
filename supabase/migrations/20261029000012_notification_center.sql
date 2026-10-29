-- Pusat notifikasi: lonceng di header semua role, diperbarui real time.
--
-- Notifikasi baru dipasang lewat trigger pada perubahan status, jadi fungsi yang sudah ada tidak berubah:
-- - admin: lamaran shopper masuk, bukti bayar diunggah, hasil kunjungan dikirim, tawaran tugas ditolak atau
--   kedaluwarsa, konsultasi dibooking atau digeser client.
-- - client: pesanan dikonfirmasi atau dibatalkan admin, pembayaran diverifikasi atau ditolak, audit mulai berjalan,
--   tagihan jatuh tempo dalam 24 jam.
-- Tindakan yang dilakukan admin sendiri tidak dikirim ke admin.

-- ---------------------------------------------------------------------------
-- Fungsi bantu
-- ---------------------------------------------------------------------------

create or replace function public.notify_admins(p_kind text, p_detail jsonb default '{}'::jsonb)
returns void
language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, detail)
  select id, p_kind, coalesce(p_detail, '{}'::jsonb) from public.profiles where role = 'admin' and status = 'active';
$$;

create or replace function public.profile_name(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(full_name), ''), email) from public.profiles where id = p_user;
$$;

-- Satu notifikasi ditandai sudah dibaca (saat diklik dari lonceng).
create or replace function public.mark_notification_read(p_id bigint)
returns void
language sql security definer set search_path = public as $$
  update public.notifications set read_at = now() where id = p_id and user_id = auth.uid() and read_at is null;
$$;

-- Pengingat tagihan yang jatuh tempo dalam 24 jam, sekali untuk setiap batas waktu. Aman dipanggil kapan saja.
create or replace function public.remind_due_invoices() returns integer
language plpgsql security definer set search_path = public as $$
declare
  n integer := 0;
  r record;
begin
  for r in
    select i.id, i.code, i.client_id, i.due_at, i.total, i.project_id from public.invoices i
    where i.status = 'unpaid' and i.due_at > now() and i.due_at <= now() + interval '24 hours'
      and not exists (
        select 1 from public.notifications n
        where n.user_id = i.client_id and n.kind = 'invoice.due_soon'
          and n.detail ->> 'invoice' = i.id::text and n.detail ->> 'due' = to_jsonb(i.due_at) #>> '{}'
      )
  loop
    perform public.notify(r.client_id, 'invoice.due_soon',
      jsonb_build_object('invoice', r.id, 'code', r.code, 'due', r.due_at, 'total', r.total, 'project', r.project_id));
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------------

create or replace function public.notify_on_application() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'submitted' and old.status is distinct from 'submitted' then
    perform public.notify_admins('admin.application',
      jsonb_build_object('application', new.id, 'name', public.profile_name(new.shopper_id)));
  end if;
  return new;
end;
$$;

create trigger shopper_applications_notify after update of status on public.shopper_applications
  for each row execute function public.notify_on_application();

create or replace function public.notify_on_invoice() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  detail jsonb := jsonb_build_object('invoice', new.id, 'code', new.code, 'kind', new.kind, 'total', new.total, 'project', new.project_id);
begin
  if new.status = old.status then
    return new;
  end if;
  if new.status = 'verifying' and old.status = 'unpaid' then
    perform public.notify_admins('admin.payment', detail || jsonb_build_object('name', public.profile_name(new.client_id)));
  elsif new.status = 'paid' and old.status = 'verifying' then
    perform public.notify(new.client_id, 'invoice.paid', detail);
  elsif new.status = 'unpaid' and old.status = 'verifying' then
    perform public.notify(new.client_id, 'invoice.rejected', detail || jsonb_build_object('note', new.status_note, 'due', new.due_at));
  end if;
  return new;
end;
$$;

create trigger invoices_notify after update of status on public.invoices
  for each row execute function public.notify_on_invoice();

create or replace function public.notify_on_project() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  detail jsonb := jsonb_build_object('project', new.id, 'code', new.code);
begin
  if new.status = 'awaiting_payment' and old.status = 'awaiting_review' then
    perform public.notify(new.client_id, 'order.ready', detail);
  elsif new.status = 'cancelled' and old.status is distinct from 'cancelled' and public.is_admin() then
    perform public.notify(new.client_id, 'order.cancelled', detail || jsonb_build_object('note', new.status_note));
  end if;
  return new;
end;
$$;

create trigger projects_notify after update of status on public.projects
  for each row execute function public.notify_on_project();

create or replace function public.notify_on_task() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  proj public.projects;
begin
  -- Hasil kunjungan dikirim shopper (bukan revisi yang kedaluwarsa, yang juga kembali ke status submitted).
  if new.status = 'submitted' and new.submitted_at is distinct from old.submitted_at then
    perform public.notify_admins('admin.visit_submitted',
      jsonb_build_object('task', new.id, 'code', new.code, 'resubmitted', old.status = 'revision'));
  end if;
  -- Shopper pertama yang menerima tugas di sebuah proyek: audit client mulai berjalan.
  if new.status = 'accepted' and old.status = 'offered' then
    select * into proj from public.projects where id = new.project_id;
    if not exists (
      select 1 from public.notifications
      where user_id = proj.client_id and kind = 'project.started' and detail ->> 'project' = proj.id::text
    ) then
      perform public.notify(proj.client_id, 'project.started', jsonb_build_object('project', proj.id, 'code', proj.code));
    end if;
  end if;
  return new;
end;
$$;

create trigger audit_tasks_notify after update of status, submitted_at on public.audit_tasks
  for each row execute function public.notify_on_task();

create or replace function public.notify_on_offer() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  task public.audit_tasks;
begin
  if old.status = 'offered' and new.status in ('declined', 'expired') then
    select * into task from public.audit_tasks where id = new.task_id;
    perform public.notify_admins(case when new.status = 'declined' then 'admin.offer_declined' else 'admin.offer_expired' end,
      jsonb_build_object('task', task.id, 'code', task.code, 'project', task.project_id,
                         'name', public.profile_name(new.shopper_id), 'note', new.decline_reason));
  end if;
  return new;
end;
$$;

create trigger task_offers_notify after update of status on public.task_offers
  for each row execute function public.notify_on_offer();

create or replace function public.notify_on_consultation() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  detail jsonb := jsonb_build_object('consultation', new.id, 'code', new.code, 'starts_at', new.starts_at,
                                     'name', public.profile_name(new.client_id));
begin
  if public.is_admin() then
    return new;
  end if;
  if old.status = 'available' and new.status = 'scheduled' then
    perform public.notify_admins('admin.consultation_booked', detail);
  elsif old.status = 'scheduled' and new.status = 'scheduled' and new.starts_at is distinct from old.starts_at then
    perform public.notify_admins('admin.consultation_rescheduled', detail);
  end if;
  return new;
end;
$$;

create trigger consultations_notify after update of status, starts_at on public.consultations
  for each row execute function public.notify_on_consultation();

-- ---------------------------------------------------------------------------
-- Hak akses dan real time
-- ---------------------------------------------------------------------------

revoke all on function public.notify_admins(text, jsonb) from public, anon, authenticated;
revoke all on function public.profile_name(uuid) from public, anon, authenticated;
revoke all on function public.mark_notification_read(bigint) from public, anon;
grant execute on function public.mark_notification_read(bigint) to authenticated;
revoke all on function public.remind_due_invoices() from public, anon;
grant execute on function public.remind_due_invoices() to authenticated;
revoke all on function public.notify_on_application() from public, anon, authenticated;
revoke all on function public.notify_on_invoice() from public, anon, authenticated;
revoke all on function public.notify_on_project() from public, anon, authenticated;
revoke all on function public.notify_on_task() from public, anon, authenticated;
revoke all on function public.notify_on_offer() from public, anon, authenticated;
revoke all on function public.notify_on_consultation() from public, anon, authenticated;

-- Notifikasi baru dikirim ke browser lewat Supabase Realtime; RLS tetap berlaku (hanya pemiliknya yang menerima).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
