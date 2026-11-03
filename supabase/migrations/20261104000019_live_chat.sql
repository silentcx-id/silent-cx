-- Live chat Sisca (Silent Interactive System for Customers Assistance) dan email admin untuk bukti bayar.
--
-- Setiap client dan shopper punya satu percakapan dengan admin. Admin membalas atas nama Sisca; siapa yang membalas
-- tetap tercatat di sender_id. Pesan hanya ditulis lewat fungsi di bawah (security definer), tidak langsung ke tabel.
-- Di luar jam kerja (app_settings 'chat'), pesan pengguna dibalas otomatis satu kali sampai admin membalas.

-- ---------------------------------------------------------------------------
-- Email: admin menerima email untuk bukti bayar; balasan chat dikirim ke email pengguna kalau 5 menit belum dibaca.

alter table public.notifications add column email_not_before timestamptz;

-- Daftar ini sama dengan EMAIL_KINDS di src/lib/email-content.ts (dicek tes).
create or replace function public.is_email_kind(p_kind text) returns boolean
language sql immutable as $$
  select p_kind in (
    'task.offered', 'task.revision', 'application.approved', 'application.rejected', 'payout.paid',
    'order.ready', 'invoice.paid', 'invoice.rejected', 'invoice.due_soon', 'report.published',
    'admin.payment', 'chat.reply'
  );
$$;

-- Notifikasi admin.* hanya untuk admin; sisanya hanya untuk client dan shopper.
create or replace function public.queue_notification_email() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  target public.app_role;
begin
  if not public.is_email_kind(new.kind) then
    return new;
  end if;
  select role into target from public.profiles where id = new.user_id;
  if (new.kind like 'admin.%') = (target = 'admin') then
    new.email_status := 'pending';
    if new.kind = 'chat.reply' then
      new.email_not_before := now() + interval '5 minutes';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tabel

create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'closed')),
  last_message text not null default '' check (char_length(last_message) <= 160),
  last_message_at timestamptz not null default now(),
  -- Pesan dari pihak lain yang belum dibaca.
  user_unread integer not null default 0 check (user_unread >= 0),
  admin_unread integer not null default 0 check (admin_unread >= 0),
  -- Kapan admin terakhir membaca, untuk tanda "Dibaca" di sisi pengguna.
  admin_read_at timestamptz,
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index chat_threads_recent_idx on public.chat_threads (last_message_at desc);

create table public.chat_messages (
  id bigint generated always as identity primary key,
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  from_admin boolean not null,
  -- Balasan otomatis di luar jam kerja.
  auto boolean not null default false,
  body text not null default '' check (char_length(body) <= 2000),
  attachment_path text check (attachment_path is null or char_length(attachment_path) between 1 and 300),
  created_at timestamptz not null default now(),
  check (char_length(btrim(body)) > 0 or attachment_path is not null)
);

create index chat_messages_thread_idx on public.chat_messages (thread_id, id);

alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;

create policy "percakapan dibaca pemilik dan admin" on public.chat_threads for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy "pesan dibaca pemilik percakapan dan admin" on public.chat_messages for select to authenticated
  using (public.is_admin() or exists (select 1 from public.chat_threads t where t.id = thread_id and t.user_id = auth.uid()));

revoke all on public.chat_threads, public.chat_messages from anon;
revoke insert, update, delete on public.chat_threads, public.chat_messages from authenticated;

-- Pesan baru langsung tampil lewat Supabase Realtime (dengan aturan baca di atas).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.chat_messages, public.chat_threads;
  end if;
end;
$$;

-- Jam kerja dan teks balasan otomatis. days: 1 = Senin … 7 = Minggu (ISO), jam dalam WIB.
insert into public.app_settings (key, value) values ('chat', jsonb_build_object(
  'days', jsonb_build_array(1, 2, 3, 4, 5),
  'start', '09:00',
  'end', '17:00',
  'away_message', 'Terima kasih sudah menghubungi SilentCX. Saat ini di luar jam kerja kami (Senin–Jumat, 09.00–17.00 WIB). Sisca akan membalas pesan Anda di jam kerja berikutnya.'
)) on conflict (key) do nothing;

create or replace function public.chat_is_open(p_at timestamptz default now())
returns boolean
language sql stable security definer set search_path = public as $$
  with s as (select coalesce((select value from public.app_settings where key = 'chat'), '{}'::jsonb) as v),
       w as (select (p_at at time zone 'Asia/Jakarta') as local)
  select coalesce(v -> 'days', '[1,2,3,4,5]'::jsonb) @> to_jsonb(extract(isodow from local)::int)
     and local::time >= coalesce(v ->> 'start', '09:00')::time
     and local::time < coalesce(v ->> 'end', '17:00')::time
  from s, w;
$$;

-- Cuplikan pesan untuk daftar percakapan dan notifikasi.
create or replace function public.chat_preview(p_body text, p_attachment text)
returns text
language sql immutable as $$
  select case when btrim(coalesce(p_body, '')) = '' then '📷 Foto' else left(regexp_replace(btrim(p_body), '\s+', ' ', 'g'), 140) end;
$$;

-- ---------------------------------------------------------------------------
-- Pengguna (client dan shopper)

create or replace function public.chat_send(p_body text, p_attachment text default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  th public.chat_threads;
  msg bigint;
  body text := btrim(coalesce(p_body, ''));
  preview text;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null or me.role = 'admin' then
    raise exception 'Live chat hanya untuk client dan shopper.' using errcode = '42501';
  end if;
  if p_attachment is not null and p_attachment not like me.id::text || '/%' then
    raise exception 'Lampiran tidak valid.' using errcode = '22023';
  end if;
  if body = '' and p_attachment is null then
    raise exception 'Tulis pesan atau lampirkan foto.' using errcode = '22023';
  end if;
  if char_length(body) > 2000 then
    raise exception 'Pesan maksimal 2.000 karakter.' using errcode = '22023';
  end if;

  insert into public.chat_threads (user_id) values (me.id) on conflict (user_id) do nothing;
  select * into th from public.chat_threads where user_id = me.id for update;
  if (select count(*) from public.chat_messages where thread_id = th.id and not from_admin and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Terlalu banyak pesan dalam satu menit. Tunggu sebentar.' using errcode = '22023';
  end if;

  insert into public.chat_messages (thread_id, sender_id, from_admin, body, attachment_path)
  values (th.id, me.id, false, body, p_attachment) returning id into msg;
  preview := public.chat_preview(body, p_attachment);
  update public.chat_threads
  set last_message = preview, last_message_at = now(), admin_unread = admin_unread + 1, status = 'open', closed_at = null, closed_by = null
  where id = th.id;

  -- Satu notifikasi admin untuk setiap rangkaian pesan yang belum dibaca.
  if th.admin_unread = 0 then
    perform public.notify_admins('admin.chat', jsonb_build_object('thread', th.id, 'name', public.profile_name(me.id), 'role', me.role, 'preview', preview));
  end if;

  -- Di luar jam kerja: balasan otomatis sekali, sampai admin membalas.
  if not public.chat_is_open(now()) and not exists (
    select 1 from public.chat_messages m
    where m.thread_id = th.id and m.auto
      and m.id > coalesce((select max(id) from public.chat_messages where thread_id = th.id and from_admin and not auto), 0)
  ) then
    insert into public.chat_messages (thread_id, from_admin, auto, body)
    values (th.id, true, true, coalesce((select value ->> 'away_message' from public.app_settings where key = 'chat'), 'Sisca akan membalas di jam kerja.'));
  end if;
  return msg;
end;
$$;

-- Pengguna membuka chat: pesan admin ditandai dibaca, dan email balasan yang belum terkirim dibatalkan.
create or replace function public.chat_mark_read()
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.chat_threads set user_unread = 0 where user_id = auth.uid() and user_unread > 0;
  update public.notifications
  set read_at = coalesce(read_at, now()),
      email_status = case when email_status = 'pending' then 'skipped' else email_status end
  where user_id = auth.uid() and kind = 'chat.reply' and (read_at is null or email_status = 'pending');
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin

create or replace function public.admin_chat_send(p_thread uuid, p_body text, p_attachment text default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  th public.chat_threads;
  msg bigint;
  body text := btrim(coalesce(p_body, ''));
  owner public.profiles;
  preview text;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa membalas sebagai Sisca.' using errcode = '42501';
  end if;
  select * into th from public.chat_threads where id = p_thread for update;
  if th.id is null then
    raise exception 'Percakapan tidak ditemukan.' using errcode = 'P0002';
  end if;
  if p_attachment is not null and p_attachment not like 'admin/' || th.id::text || '/%' then
    raise exception 'Lampiran tidak valid.' using errcode = '22023';
  end if;
  if body = '' and p_attachment is null then
    raise exception 'Tulis pesan atau lampirkan foto.' using errcode = '22023';
  end if;
  if char_length(body) > 2000 then
    raise exception 'Pesan maksimal 2.000 karakter.' using errcode = '22023';
  end if;

  insert into public.chat_messages (thread_id, sender_id, from_admin, body, attachment_path)
  values (th.id, auth.uid(), true, body, p_attachment) returning id into msg;
  preview := public.chat_preview(body, p_attachment);
  update public.chat_threads
  set last_message = preview, last_message_at = now(), user_unread = user_unread + 1, admin_unread = 0, admin_read_at = now(),
      status = 'open', closed_at = null, closed_by = null
  where id = th.id;
  update public.notifications set read_at = now() where kind = 'admin.chat' and detail ->> 'thread' = th.id::text and read_at is null;

  if th.user_unread = 0 then
    select * into owner from public.profiles where id = th.user_id;
    perform public.notify(th.user_id, 'chat.reply', jsonb_build_object('thread', th.id, 'preview', preview, 'home', case when owner.role = 'shopper' then '/shopper' else '/app' end));
  end if;
  return msg;
end;
$$;

create or replace function public.admin_chat_mark_read(p_thread uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Hanya admin.' using errcode = '42501';
  end if;
  update public.chat_threads set admin_unread = 0, admin_read_at = now() where id = p_thread;
  update public.notifications set read_at = now() where kind = 'admin.chat' and detail ->> 'thread' = p_thread::text and read_at is null;
end;
$$;

create or replace function public.admin_chat_set_status(p_thread uuid, p_status text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Hanya admin.' using errcode = '42501';
  end if;
  if p_status not in ('open', 'closed') then
    raise exception 'Status tidak valid.' using errcode = '22023';
  end if;
  update public.chat_threads
  set status = p_status,
      closed_at = case when p_status = 'closed' then now() end,
      closed_by = case when p_status = 'closed' then auth.uid() end,
      admin_unread = case when p_status = 'closed' then 0 else admin_unread end
  where id = p_thread;
end;
$$;

revoke execute on function public.chat_send(text, text), public.chat_mark_read(), public.admin_chat_send(uuid, text, text),
  public.admin_chat_mark_read(uuid), public.admin_chat_set_status(uuid, text) from public, anon;
grant execute on function public.chat_send(text, text), public.chat_mark_read(), public.admin_chat_send(uuid, text, text),
  public.admin_chat_mark_read(uuid), public.admin_chat_set_status(uuid, text), public.chat_is_open(timestamptz) to authenticated;
