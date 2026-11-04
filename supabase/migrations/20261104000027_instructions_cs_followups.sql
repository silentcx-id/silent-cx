-- Putaran 16:
-- 1. Instruksi shopper: template instruksi per kuesioner (dipilih admin saat membuat tugas per outlet),
--    instruksi tugas boleh sampai 4000 karakter.
-- 2. Peran CS: akun dibuat admin (app_metadata.provisioned_role = 'cs'), melihat semua akun client beserta status
--    paketnya, outlet client, dan mencatat follow-up WhatsApp.
-- 3. Log follow-up client, dipakai CS dan tombol "Konfirmasi WA" admin di halaman proyek.

-- ---------------------------------------------------------------------------
-- 1. Instruksi shopper
-- ---------------------------------------------------------------------------

-- [{ "name": "Dine-in", "scenario": "…", "purchase": "…" }], urutan = urutan di pilihan template.
alter table public.questionnaires
  add column instruction_templates jsonb not null default '[]'::jsonb
    check (jsonb_typeof(instruction_templates) = 'array' and jsonb_array_length(instruction_templates) <= 12);

alter table public.audit_tasks drop constraint if exists audit_tasks_scenario_check;
alter table public.audit_tasks add constraint audit_tasks_scenario_check check (char_length(scenario) <= 4000);

-- Salinan kuesioner khusus proyek ikut membawa template instruksinya.
create or replace function public.admin_copy_questionnaire_for_project(p_project uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  proj public.projects;
  pq public.project_questionnaires;
  src public.questionnaires;
  v_id uuid;
  v_section uuid;
  s record;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa menyalin kuesioner.' using errcode = '42501';
  end if;
  select * into proj from public.projects where id = p_project;
  select * into pq from public.project_questionnaires where project_id = p_project;
  if not found then
    raise exception 'Tetapkan kuesioner proyek dulu.' using errcode = '22023';
  end if;
  select * into src from public.questionnaires where id = pq.questionnaire_id;
  if not found then
    raise exception 'Kuesioner asli sudah dihapus, jadi tidak bisa disalin.' using errcode = 'P0002';
  end if;
  if src.project_id = p_project then
    return src.id;
  end if;

  insert into public.questionnaires (name, business_type, description, photo_limit, active, project_id, instruction_templates)
  values (left(src.name || ' · ' || proj.code, 120), src.business_type, src.description, src.photo_limit, true, p_project, src.instruction_templates)
  returning id into v_id;
  for s in select * from public.questionnaire_sections where questionnaire_id = src.id order by position loop
    insert into public.questionnaire_sections (questionnaire_id, position, title, weight, target)
    values (v_id, s.position, s.title, s.weight, s.target)
    returning id into v_section;
    insert into public.questionnaire_questions (section_id, position, prompt, help, kind, photo_required, is_sop, red_flag, journey_stage_id)
    select v_section, q.position, q.prompt, q.help, q.kind, q.photo_required, q.is_sop, q.red_flag, q.journey_stage_id
    from public.questionnaire_questions q where q.section_id = s.id;
  end loop;

  update public.project_questionnaires set questionnaire_id = v_id where project_id = p_project;
  perform public.log_activity('questionnaire.copied_for_project', 'questionnaire', v_id::text,
    jsonb_build_object('project', p_project, 'source', src.id));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Peran CS
-- ---------------------------------------------------------------------------

create or replace function public.is_cs() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'cs' and status = 'active');
$$;

-- Admin atau CS aktif.
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'cs') and status = 'active');
$$;

revoke execute on function public.is_cs() from public, anon;
grant execute on function public.is_cs() to authenticated;
revoke execute on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;

-- Pendaftaran publik tetap hanya client atau shopper. Akun admin dan CS hanya lewat provisioning server.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  provisioned text := new.raw_app_meta_data ->> 'provisioned_role';
  requested text := new.raw_user_meta_data ->> 'account_type';
  new_role public.app_role;
  new_status public.account_status;
begin
  if provisioned in ('admin', 'cs') then
    new_role := provisioned::public.app_role;
    new_status := 'active';
  elsif provisioned = 'shopper' or requested = 'shopper' then
    new_role := 'shopper';
    new_status := case when provisioned = 'shopper' then 'active' else 'pending' end;
  else
    new_role := 'client';
    new_status := 'active';
  end if;

  insert into public.profiles (id, role, status, full_name, email, phone, locale)
  values (
    new.id,
    new_role,
    new_status,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120),
    lower(new.email),
    case when coalesce(new.raw_user_meta_data ->> 'phone', '') ~ '^\+?[0-9]{8,15}$'
         then new.raw_user_meta_data ->> 'phone' end,
    case when new.raw_user_meta_data ->> 'locale' = 'en' then 'en' else 'id' end
  );

  insert into public.activity_log (actor_id, action, target_type, target_id, detail)
  values (new.id, 'account.created', 'profile', new.id::text,
          jsonb_build_object('role', new_role, 'status', new_status));

  return new;
end;
$$;

create or replace function public.handle_user_provisioned() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  provisioned text := new.raw_app_meta_data ->> 'provisioned_role';
  current_profile public.profiles;
begin
  if provisioned is not distinct from (old.raw_app_meta_data ->> 'provisioned_role')
     or provisioned not in ('admin', 'shopper', 'cs') then
    return new;
  end if;

  select * into current_profile from public.profiles where id = new.id;
  if not found or (current_profile.role = provisioned::public.app_role and current_profile.status = 'active') then
    return new;
  end if;

  update public.profiles
  set role = provisioned::public.app_role, status = 'active', status_note = null
  where id = new.id;

  insert into public.activity_log (actor_id, action, target_type, target_id, detail)
  values (null, 'account.provisioned', 'profile', new.id::text,
          jsonb_build_object('from_role', current_profile.role, 'to_role', provisioned));
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_provisioned() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Log follow-up client
-- ---------------------------------------------------------------------------

create table public.client_followups (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  staff_id uuid references public.profiles (id) on delete set null,
  channel text not null default 'wa' check (channel in ('wa', 'call', 'email', 'other')),
  -- followup = follow-up CS; project_confirm = konfirmasi proyek dari admin.
  purpose text not null default 'followup' check (purpose in ('followup', 'project_confirm')),
  outcome text not null default 'sent' check (outcome in ('sent', 'replied', 'interested', 'not_interested', 'no_answer', 'other')),
  note text not null default '' check (char_length(note) <= 1000),
  -- Pesan yang dikirim lewat WhatsApp, apa adanya.
  message text not null default '' check (char_length(message) <= 4000),
  -- Jadwal follow-up berikutnya (tanggal WIB). Yang dipakai hanya catatan terbaru tiap client.
  next_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index client_followups_client_idx on public.client_followups (client_id, created_at desc);
create index client_followups_staff_idx on public.client_followups (staff_id, created_at desc);

create trigger client_followups_touch before update on public.client_followups
  for each row execute function public.touch_updated_at();

alter table public.client_followups enable row level security;
create policy "staf membaca follow-up" on public.client_followups for select to authenticated using (public.is_staff());
revoke all on public.client_followups from anon;
revoke insert, update, delete on public.client_followups from authenticated;

create or replace function public.log_client_followup(
  p_client uuid,
  p_project uuid default null,
  p_channel text default 'wa',
  p_purpose text default 'followup',
  p_outcome text default 'sent',
  p_note text default '',
  p_message text default '',
  p_next date default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Hanya admin dan CS yang bisa mencatat follow-up.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_client and role = 'client') then
    raise exception 'Akun client tidak ditemukan.' using errcode = 'P0002';
  end if;
  if p_project is not null and not exists (select 1 from public.projects where id = p_project and client_id = p_client) then
    raise exception 'Proyek ini bukan milik client tersebut.' using errcode = '22023';
  end if;
  if p_purpose = 'project_confirm' and p_project is null then
    raise exception 'Konfirmasi proyek butuh proyeknya.' using errcode = '22023';
  end if;
  if p_next is not null and p_next < (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Jadwal follow-up berikutnya tidak boleh tanggal yang sudah lewat.' using errcode = '22023';
  end if;

  insert into public.client_followups (client_id, project_id, staff_id, channel, purpose, outcome, note, message, next_at)
  values (p_client, p_project, auth.uid(), coalesce(p_channel, 'wa'), coalesce(p_purpose, 'followup'), coalesce(p_outcome, 'sent'),
          btrim(coalesce(p_note, '')), btrim(coalesce(p_message, '')), p_next)
  returning id into v_id;

  perform public.log_activity('client.followup', 'profile', p_client::text,
    jsonb_build_object('followup', v_id, 'purpose', p_purpose, 'channel', p_channel, 'project', p_project));
  return v_id;
end;
$$;

-- Hasil follow-up dilengkapi setelah WhatsApp dibuka: oleh pencatatnya sendiri atau admin.
create or replace function public.update_client_followup(p_id uuid, p_outcome text, p_note text default '', p_next date default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  f public.client_followups;
begin
  if not public.is_staff() then
    raise exception 'Hanya admin dan CS yang bisa mengubah follow-up.' using errcode = '42501';
  end if;
  select * into f from public.client_followups where id = p_id for update;
  if not found then
    raise exception 'Catatan follow-up tidak ditemukan.' using errcode = 'P0002';
  end if;
  if f.staff_id is distinct from auth.uid() and not public.is_admin() then
    raise exception 'Catatan ini dibuat staf lain, jadi tidak bisa diubah.' using errcode = '42501';
  end if;
  if p_next is not null and p_next < (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Jadwal follow-up berikutnya tidak boleh tanggal yang sudah lewat.' using errcode = '22023';
  end if;
  update public.client_followups
  set outcome = p_outcome, note = btrim(coalesce(p_note, '')), next_at = p_next
  where id = p_id;
end;
$$;

-- Tahap client dari proyek yang paling relevan: pesanan terbuka dulu, lalu yang berjalan, lalu yang terbaru.
-- new = belum pernah pesan; review/payment/verifying = pesanan terbuka; running = audit berjalan;
-- done = laporan terbit; lapsed = pesanan dibatalkan atau kedaluwarsa.
create or replace function public.client_stage(p_status public.project_status) returns text
language sql immutable as $$
  select case
    when p_status is null then 'new'
    when p_status = 'awaiting_review' then 'review'
    when p_status = 'awaiting_payment' then 'payment'
    when p_status = 'verifying' then 'verifying'
    when p_status in ('active', 'reporting') then 'running'
    when p_status = 'completed' then 'done'
    else 'lapsed'
  end;
$$;

-- Daftar client untuk CS dan admin. p_stage: '' = semua, 'due' = jadwal follow-up hari ini atau terlewat,
-- selain itu tahap dari client_stage.
create or replace function public.cs_list_clients(
  p_stage text default '',
  p_q text default '',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  full_name text,
  email text,
  phone text,
  account_status public.account_status,
  created_at timestamptz,
  company text,
  industry text,
  city text,
  pic_name text,
  pic_phone text,
  stage text,
  project_id uuid,
  project_code text,
  project_status public.project_status,
  package_name text,
  outlet_count integer,
  project_count bigint,
  invoice_code text,
  invoice_status public.invoice_status,
  invoice_total integer,
  invoice_due_at timestamptz,
  last_followup_at timestamptz,
  last_followup_by text,
  last_outcome text,
  next_followup_at date,
  followups bigint,
  total bigint
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  q text := replace(replace(replace(btrim(coalesce(p_q, '')), '\', '\\'), '%', '\%'), '_', '\_');
  today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if not public.is_staff() then
    raise exception 'Hanya admin dan CS yang bisa melihat daftar client.' using errcode = '42501';
  end if;
  return query
  with base as (
    select
      p.id, p.full_name, p.email, p.phone, p.status as account_status, p.created_at,
      nullif(c.name, '') as company, nullif(c.industry, '') as industry, nullif(c.city, '') as city,
      nullif(c.pic_name, '') as pic_name, nullif(c.pic_phone, '') as pic_phone,
      public.client_stage(pr.status) as stage,
      pr.id as project_id, pr.code as project_code, pr.status as project_status,
      pr.package_snapshot ->> 'name' as package_name, pr.outlet_count,
      (select count(*) from public.projects x where x.client_id = p.id) as project_count,
      inv.code as invoice_code, inv.status as invoice_status, inv.total as invoice_total, inv.due_at as invoice_due_at,
      f.created_at as last_followup_at, nullif(sp.full_name, '') as last_followup_by, f.outcome as last_outcome, f.next_at as next_followup_at,
      (select count(*) from public.client_followups y where y.client_id = p.id) as followups
    from public.profiles p
    left join public.companies c on c.client_id = p.id
    left join lateral (
      select x.* from public.projects x
      where x.client_id = p.id
      order by (x.status in ('awaiting_review', 'awaiting_payment', 'verifying')) desc,
               (x.status in ('active', 'reporting')) desc,
               x.created_at desc
      limit 1
    ) pr on true
    left join lateral (
      select i.* from public.invoices i
      where i.project_id = pr.id
      order by (i.status in ('unpaid', 'verifying')) desc, i.created_at desc
      limit 1
    ) inv on true
    left join lateral (
      select y.* from public.client_followups y where y.client_id = p.id order by y.created_at desc limit 1
    ) f on true
    left join public.profiles sp on sp.id = f.staff_id
    where p.role = 'client'
      and (q = '' or p.full_name ilike '%' || q || '%' or p.email ilike '%' || q || '%' or coalesce(p.phone, '') ilike '%' || q || '%'
           or coalesce(c.name, '') ilike '%' || q || '%' or coalesce(c.pic_phone, '') ilike '%' || q || '%'
           or exists (select 1 from public.projects z where z.client_id = p.id and z.code ilike '%' || q || '%'))
  )
  select b.*, count(*) over ()
  from base b
  where coalesce(p_stage, '') = ''
     or (p_stage = 'due' and b.next_followup_at is not null and b.next_followup_at <= today)
     or b.stage = p_stage
  order by case when p_stage = 'due' then b.next_followup_at end asc nulls last, b.created_at desc, b.id
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Jumlah client per tahap untuk tab, ditambah 'all' dan 'due'.
create or replace function public.cs_client_counts()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Jakarta')::date;
  result jsonb;
begin
  if not public.is_staff() then
    raise exception 'Hanya admin dan CS yang bisa melihat daftar client.' using errcode = '42501';
  end if;
  with cl as (
    select
      public.client_stage((
        select x.status from public.projects x where x.client_id = p.id
        order by (x.status in ('awaiting_review', 'awaiting_payment', 'verifying')) desc,
                 (x.status in ('active', 'reporting')) desc, x.created_at desc
        limit 1
      )) as stage,
      (select y.next_at from public.client_followups y where y.client_id = p.id order by y.created_at desc limit 1) as next_at
    from public.profiles p
    where p.role = 'client'
  )
  select coalesce(jsonb_object_agg(stage, n), '{}'::jsonb)
         || jsonb_build_object('all', (select count(*) from cl),
                               'due', (select count(*) from cl where next_at is not null and next_at <= today))
  into result
  from (select stage, count(*) as n from cl group by stage) s;
  return result;
end;
$$;

-- Detail satu client: profil, perusahaan, semua proyek beserta invoice dan outletnya, dan riwayat follow-up.
create or replace function public.cs_client_detail(p_client uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  result jsonb;
begin
  if not public.is_staff() then
    raise exception 'Hanya admin dan CS yang bisa melihat data client.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'id', p.id, 'full_name', p.full_name, 'email', p.email, 'phone', p.phone,
    'account_status', p.status, 'created_at', p.created_at,
    'company', (select to_jsonb(c) - 'client_id' from public.companies c where c.client_id = p.id),
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pr.id, 'code', pr.code, 'status', pr.status, 'stage', public.client_stage(pr.status),
        'package_name', pr.package_snapshot ->> 'name', 'outlet_count', pr.outlet_count,
        'created_at', pr.created_at, 'activated_at', pr.activated_at, 'details_completed_at', pr.details_completed_at,
        'invoices', coalesce((
          select jsonb_agg(jsonb_build_object('code', i.code, 'status', i.status, 'total', i.total, 'due_at', i.due_at, 'paid_at', i.paid_at)
                           order by i.created_at)
          from public.invoices i where i.project_id = pr.id
        ), '[]'::jsonb),
        'outlets', coalesce((
          select jsonb_agg(jsonb_build_object('id', o.id, 'position', o.position, 'name', o.name, 'city', o.city, 'address', o.address,
                                              'maps_url', o.maps_url, 'notes', o.notes, 'is_competitor', o.is_competitor)
                           order by o.position)
          from public.project_outlets o where o.project_id = pr.id
        ), '[]'::jsonb)
      ) order by pr.created_at desc)
      from public.projects pr where pr.client_id = p.id
    ), '[]'::jsonb),
    'followups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'created_at', f.created_at, 'channel', f.channel, 'purpose', f.purpose, 'outcome', f.outcome,
        'note', f.note, 'message', f.message, 'next_at', f.next_at, 'staff_id', f.staff_id,
        'staff', nullif(s.full_name, ''), 'staff_role', s.role, 'project_code', pr.code
      ) order by f.created_at desc)
      from public.client_followups f
      left join public.profiles s on s.id = f.staff_id
      left join public.projects pr on pr.id = f.project_id
      where f.client_id = p.id
    ), '[]'::jsonb)
  )
  into result
  from public.profiles p
  where p.id = p_client and p.role = 'client';
  return result;
end;
$$;

-- Riwayat follow-up semua client (terbaru dulu), bisa disaring per staf.
create or replace function public.cs_followup_log(p_staff uuid default null, p_limit integer default 30, p_offset integer default 0)
returns table (
  id uuid,
  created_at timestamptz,
  client_id uuid,
  client_name text,
  company text,
  project_code text,
  staff text,
  staff_role public.app_role,
  channel text,
  purpose text,
  outcome text,
  note text,
  next_at date,
  total bigint
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_staff() then
    raise exception 'Hanya admin dan CS yang bisa melihat riwayat follow-up.' using errcode = '42501';
  end if;
  return query
  select f.id, f.created_at, f.client_id, coalesce(nullif(cp.full_name, ''), cp.email), nullif(c.name, ''), pr.code,
         nullif(s.full_name, ''), s.role, f.channel, f.purpose, f.outcome, f.note, f.next_at, count(*) over ()
  from public.client_followups f
  join public.profiles cp on cp.id = f.client_id
  left join public.companies c on c.client_id = f.client_id
  left join public.profiles s on s.id = f.staff_id
  left join public.projects pr on pr.id = f.project_id
  where p_staff is null or f.staff_id = p_staff
  order by f.created_at desc, f.id
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Staf yang pernah mencatat follow-up, untuk saringan riwayat.
create or replace function public.cs_staff()
returns table (id uuid, full_name text, role public.app_role)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_staff() then
    raise exception 'Hanya admin dan CS yang bisa melihat daftar staf.' using errcode = '42501';
  end if;
  return query
  select p.id, coalesce(nullif(p.full_name, ''), p.email), p.role
  from public.profiles p
  where p.role in ('admin', 'cs') and p.status = 'active'
  order by p.role desc, p.full_name;
end;
$$;

revoke execute on function public.log_client_followup(uuid, uuid, text, text, text, text, text, date) from public, anon;
grant execute on function public.log_client_followup(uuid, uuid, text, text, text, text, text, date) to authenticated;
revoke execute on function public.update_client_followup(uuid, text, text, date) from public, anon;
grant execute on function public.update_client_followup(uuid, text, text, date) to authenticated;
revoke execute on function public.client_stage(public.project_status) from public, anon;
grant execute on function public.client_stage(public.project_status) to authenticated;
revoke execute on function public.cs_list_clients(text, text, integer, integer) from public, anon;
grant execute on function public.cs_list_clients(text, text, integer, integer) to authenticated;
revoke execute on function public.cs_client_counts() from public, anon;
grant execute on function public.cs_client_counts() to authenticated;
revoke execute on function public.cs_client_detail(uuid) from public, anon;
grant execute on function public.cs_client_detail(uuid) to authenticated;
revoke execute on function public.cs_followup_log(uuid, integer, integer) from public, anon;
grant execute on function public.cs_followup_log(uuid, integer, integer) to authenticated;
revoke execute on function public.cs_staff() from public, anon;
grant execute on function public.cs_staff() to authenticated;
