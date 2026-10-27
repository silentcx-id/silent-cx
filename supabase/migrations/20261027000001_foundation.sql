-- Fase 0: fondasi. Akun dengan satu role, status akun, log aktivitas, dan fungsi admin.
-- Semua tabel memakai Row Level Security; tanpa policy berarti tertutup.
-- Role dan status akun tidak pernah bisa diubah dari browser: hak update dibatasi per kolom,
-- dan perubahan role/status hanya lewat fungsi admin yang mencatat log aktivitas.

create extension if not exists pgcrypto;

create type public.app_role as enum ('client', 'shopper', 'admin');
create type public.account_status as enum ('pending', 'active', 'rejected', 'suspended');

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profil akun
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null,
  status public.account_status not null,
  -- Alasan penolakan atau penangguhan, ditampilkan ke pemilik akun.
  status_note text check (status_note is null or char_length(status_note) <= 500),
  full_name text not null default '' check (char_length(full_name) <= 120),
  email text not null unique,
  phone text check (phone is null or phone ~ '^\+?[0-9]{8,15}$'),
  locale text not null default 'id' check (locale in ('id', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_status_idx on public.profiles (role, status);

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Role pengguna yang sedang masuk; null jika tidak ada sesi atau akun tidak aktif.
-- Shopper berstatus pending tetap dikenali sebagai shopper supaya bisa melihat layar seleksi.
create or replace function public.my_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles
  where id = auth.uid() and status in ('active', 'pending');
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

-- ---------------------------------------------------------------------------
-- Log aktivitas: diisi hanya oleh fungsi database, dibaca hanya oleh admin.
-- ---------------------------------------------------------------------------

create table public.activity_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (action ~ '^[a-z_.]+$'),
  target_type text not null,
  target_id text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activity_log_created_idx on public.activity_log (created_at desc);
create index activity_log_target_idx on public.activity_log (target_type, target_id);

create or replace function public.log_activity(p_action text, p_target_type text, p_target_id text, p_detail jsonb default '{}'::jsonb)
returns void
language sql security definer set search_path = public as $$
  insert into public.activity_log (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), p_action, p_target_type, p_target_id, coalesce(p_detail, '{}'::jsonb));
$$;

-- ---------------------------------------------------------------------------
-- Akun baru
-- ---------------------------------------------------------------------------

-- Pendaftaran publik hanya bisa menjadi client (langsung aktif) atau shopper (menunggu seleksi).
-- Nilai lain di metadata, termasuk 'admin', diperlakukan sebagai client.
-- Akun admin dibuat lewat server dengan app_metadata.provisioned_role = 'admin'; app_metadata
-- hanya bisa diisi dengan service role, tidak dari browser.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  provisioned text := new.raw_app_meta_data ->> 'provisioned_role';
  requested text := new.raw_user_meta_data ->> 'account_type';
  new_role public.app_role;
  new_status public.account_status;
begin
  if provisioned = 'admin' then
    new_role := 'admin';
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

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Email profil mengikuti email login.
create or replace function public.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = lower(new.email) where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Fungsi admin
-- ---------------------------------------------------------------------------

-- Mengubah status akun client atau shopper. Admin tidak bisa mengubah akunnya sendiri
-- maupun akun admin lain, dan alasan wajib diisi saat menolak atau menangguhkan.
create or replace function public.admin_set_account_status(p_user uuid, p_status public.account_status, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  target public.profiles;
  note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa mengubah status akun.' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'Admin tidak bisa mengubah status akunnya sendiri.' using errcode = '42501';
  end if;

  select * into target from public.profiles where id = p_user for update;
  if not found then
    raise exception 'Akun tidak ditemukan.' using errcode = 'P0002';
  end if;
  if target.role = 'admin' then
    raise exception 'Status akun admin tidak bisa diubah dari sini.' using errcode = '42501';
  end if;
  if target.status = p_status then
    return;
  end if;

  -- Transisi yang sah. Client tidak pernah berstatus pending atau rejected.
  if not (
    (target.role = 'shopper' and target.status = 'pending' and p_status in ('active', 'rejected'))
    or (target.role = 'shopper' and target.status = 'rejected' and p_status = 'active')
    or (target.status = 'active' and p_status = 'suspended')
    or (target.status = 'suspended' and p_status = 'active')
  ) then
    raise exception 'Perubahan status dari % ke % tidak diizinkan.', target.status, p_status using errcode = '22023';
  end if;

  if p_status in ('rejected', 'suspended') and note is null then
    raise exception 'Alasan wajib diisi.' using errcode = '22023';
  end if;
  if note is not null and char_length(note) > 500 then
    raise exception 'Alasan maksimal 500 karakter.' using errcode = '22023';
  end if;

  update public.profiles
  set status = p_status,
      status_note = case when p_status in ('rejected', 'suspended') then note else null end
  where id = p_user;

  perform public.log_activity('account.status_changed', 'profile', p_user::text,
    jsonb_build_object('from', target.status, 'to', p_status, 'note', note));
end;
$$;

-- ---------------------------------------------------------------------------
-- Hak akses
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.activity_log enable row level security;

create policy "pemilik membaca profilnya" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "admin membaca semua profil" on public.profiles
  for select to authenticated using (public.is_admin());
create policy "pemilik mengubah profilnya" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "admin membaca log aktivitas" on public.activity_log
  for select to authenticated using (public.is_admin());

-- Supabase memberi hak penuh ke anon/authenticated pada tabel baru; dipersempit di sini.
revoke all on public.profiles from anon;
revoke insert, update, delete on public.profiles from authenticated;
grant update (full_name, phone, locale) on public.profiles to authenticated;

revoke all on public.activity_log from anon;
revoke insert, update, delete on public.activity_log from authenticated;

revoke execute on function public.log_activity(text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.admin_set_account_status(uuid, public.account_status, text) from public, anon;
grant execute on function public.admin_set_account_status(uuid, public.account_status, text) to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_email_change() from public, anon, authenticated;
