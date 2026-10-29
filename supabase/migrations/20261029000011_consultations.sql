-- Fase 5: konsultasi client dengan admin.
--
-- Jatah sesi: paket Insight 1 sesi 30 menit, Performance 1 sesi 60 menit (kolom packages.consultation_minutes),
-- ditambah add-on "Konsultasi tambahan" 60 menit per sesi. Jatah dari paket dan add-on yang dipesan bersama paket
-- muncul saat laporan terbit; add-on yang dibeli sesudahnya muncul saat pembayarannya diverifikasi.
-- Setiap jatah berlaku 30 hari: sesi harus dibooking dan berlangsung sebelum batas itu.
--
-- Jadwal: admin membuka rentang waktu kosong (WIB, kelipatan 30 menit). Client memilih jam mulai tiap 30 menit
-- yang cukup untuk durasi sesinya, paling cepat 24 jam dari sekarang. Jam yang sudah terisi tertutup untuk semua.
-- Client boleh menggeser jadwal satu kali, paling lambat 24 jam sebelum sesi. Admin menempelkan link meeting,
-- lalu menandai sesi selesai (dengan ringkasan) atau client tidak hadir. Belum ada sambungan ke Google Calendar;
-- client mengunduh file .ics.

-- ---------------------------------------------------------------------------
-- Katalog
-- ---------------------------------------------------------------------------

-- Durasi sesi gratis dari paket; 0 = paket tidak mendapat sesi (cukup lewat add-on).
alter table public.packages
  add column consultation_minutes integer not null default 0 check (consultation_minutes in (0, 30, 45, 60, 90, 120));

update public.packages set consultation_minutes = 30 where key = 'insight';
update public.packages set consultation_minutes = 60 where key = 'performance';

-- Teks fitur paket disesuaikan: Essential tidak mendapat sesi, Performance mendapat 60 menit.
update public.packages set features = array_remove(features, 'Debrief hasil 15 menit') where key = 'essential';
update public.packages set features = features || array['Konsultasi 60 menit']
where key = 'performance' and not ('Konsultasi 60 menit' = any(features));

-- Tagihan konsultasi tambahan yang dibeli setelah laporan terbit.
alter table public.invoices drop constraint invoices_kind_check;
alter table public.invoices add constraint invoices_kind_check check (kind in ('order', 'excess', 'consultation'));

-- ---------------------------------------------------------------------------
-- Tabel
-- ---------------------------------------------------------------------------

create table public.consultation_windows (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint consultation_windows_range check (ends_at > starts_at and ends_at - starts_at <= interval '12 hours')
);

create index consultation_windows_time_idx on public.consultation_windows (starts_at);

create table public.consultations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  project_id uuid not null references public.projects (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  -- package = jatah paket; addon = add-on yang dipesan bersama paket; purchase = dibeli setelah laporan terbit.
  source text not null check (source in ('package', 'addon', 'purchase')),
  invoice_id uuid references public.invoices (id) on delete set null,
  minutes integer not null check (minutes between 15 and 180),
  -- available = jatah belum dipakai (kedaluwarsa kalau expires_at lewat); scheduled; done; no_show.
  status text not null default 'available' check (status in ('available', 'scheduled', 'done', 'no_show')),
  expires_at timestamptz not null,
  starts_at timestamptz,
  ends_at timestamptz,
  topic text not null default '' check (char_length(topic) <= 1000),
  meeting_url text not null default '' check (meeting_url = '' or meeting_url ~ '^https://'),
  -- Berapa kali client menggeser jadwal (maksimal 1). Perubahan oleh admin tidak dihitung.
  reschedule_count integer not null default 0,
  summary text not null default '' check (char_length(summary) <= 4000),
  action_plan text not null default '' check (char_length(action_plan) <= 4000),
  status_note text check (status_note is null or char_length(status_note) <= 500),
  booked_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint consultations_time check ((status = 'available') = (starts_at is null) and (starts_at is null) = (ends_at is null))
);

create index consultations_client_idx on public.consultations (client_id, created_at desc);
create index consultations_schedule_idx on public.consultations (starts_at) where status = 'scheduled';

create trigger consultations_touch before update on public.consultations
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Jatah sesi
-- ---------------------------------------------------------------------------

-- Durasi sesi add-on.
create or replace function public.consultation_addon_minutes() returns integer
language sql immutable as $$ select 60 $$;

create or replace function public.add_consultations(p_project uuid, p_source text, p_minutes integer, p_count integer, p_expires timestamptz, p_invoice uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  proj public.projects;
begin
  select * into proj from public.projects where id = p_project;
  for i in 1..greatest(coalesce(p_count, 0), 0) loop
    insert into public.consultations (code, project_id, client_id, source, invoice_id, minutes, expires_at)
    values (public.next_code('KNS'), p_project, proj.client_id, p_source, p_invoice, p_minutes, p_expires);
  end loop;
end;
$$;

-- Jatah dari paket dan add-on pesanan, sekali per proyek.
create or replace function public.grant_report_consultations(p_project uuid, p_from timestamptz)
returns void
language plpgsql security definer set search_path = public as $$
declare
  proj public.projects;
  mins integer;
  extra integer;
begin
  select * into proj from public.projects where id = p_project;
  if not found or exists (select 1 from public.consultations where project_id = p_project and source in ('package', 'addon')) then
    return;
  end if;
  if 'consultation' = any(proj.entitlements) then
    select consultation_minutes into mins from public.packages
    where id = proj.package_id or key = proj.package_snapshot ->> 'key'
    order by (id = proj.package_id) desc limit 1;
    if coalesce(mins, 0) > 0 then
      perform public.add_consultations(p_project, 'package', mins, 1, p_from + interval '30 days');
    end if;
  end if;
  select coalesce(sum((l ->> 'quantity')::integer), 0) into extra
  from jsonb_array_elements(proj.addons_snapshot) l where l ->> 'item_key' = 'additional_consultation';
  perform public.add_consultations(p_project, 'addon', public.consultation_addon_minutes(), extra, p_from + interval '30 days');
end;
$$;

create or replace function public.consultations_on_report() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    perform public.grant_report_consultations(new.project_id, coalesce(new.published_at, now()));
  end if;
  return new;
end;
$$;

create trigger reports_grant_consultations after update of status on public.reports
  for each row execute function public.consultations_on_report();

create or replace function public.consultations_on_payment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  qty integer;
begin
  if new.kind = 'consultation' and new.status = 'paid' and old.status is distinct from 'paid' then
    select coalesce(sum(quantity), 0) into qty from public.invoice_lines where invoice_id = new.id and item_key = 'additional_consultation';
    perform public.add_consultations(new.project_id, 'purchase', public.consultation_addon_minutes(), qty, now() + interval '30 days', new.id);
    perform public.notify(new.client_id, 'consultation.credited', jsonb_build_object('count', qty));
  end if;
  return new;
end;
$$;

create trigger invoices_grant_consultations after update of status on public.invoices
  for each row execute function public.consultations_on_payment();

-- Laporan yang sudah terbit sebelum fitur ini ada ikut mendapat jatahnya.
select public.grant_report_consultations(project_id, published_at) from public.reports where status = 'published';

-- Tagihan konsultasi yang tidak dibayar dalam 2x24 jam ikut kedaluwarsa (tanpa mengubah status proyek).
create or replace function public.expire_overdue() returns integer
language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  update public.invoices set status = 'expired'
  where status = 'unpaid' and kind = 'consultation' and due_at < now();
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

-- Client membeli sesi tambahan setelah laporan proyeknya terbit. Pembayaran memakai alur invoice biasa.
create or replace function public.client_buy_consultation(p_project uuid, p_qty integer)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  proj public.projects;
  a public.addons;
  unit integer;
  v_invoice uuid;
begin
  select * into proj from public.projects where id = p_project and client_id = auth.uid();
  if not found then
    raise exception 'Proyek tidak ditemukan.' using errcode = 'P0002';
  end if;
  if proj.status <> 'completed' then
    raise exception 'Konsultasi tambahan bisa dibeli setelah laporan proyek terbit.' using errcode = '22023';
  end if;
  perform public.expire_overdue();
  if exists (select 1 from public.invoices where client_id = auth.uid() and kind = 'consultation' and status in ('unpaid', 'verifying')) then
    raise exception 'Masih ada tagihan konsultasi yang belum selesai. Selesaikan dulu di menu Tagihan.' using errcode = '22023';
  end if;
  select * into a from public.addons where key = 'additional_consultation' and active;
  if not found then
    raise exception 'Konsultasi tambahan sedang tidak tersedia.' using errcode = '22023';
  end if;
  if p_qty is null or p_qty < 1 or p_qty > a.max_qty then
    raise exception 'Jumlah sesi harus 1 sampai %.', a.max_qty using errcode = '22023';
  end if;
  unit := public.promo_price(a.price, a.promo_pct, a.promo_starts_at, a.promo_ends_at);

  insert into public.invoices (code, project_id, client_id, status, total, due_at, kind)
  values (public.next_code('INV'), p_project, auth.uid(), 'unpaid', unit * p_qty, now() + interval '48 hours', 'consultation')
  returning id into v_invoice;
  insert into public.invoice_lines (invoice_id, position, kind, item_key, label, quantity, unit_price, amount, list_price)
  values (v_invoice, 1, 'addon', 'additional_consultation', a.name, p_qty, unit, unit * p_qty, a.price);

  perform public.log_activity('consultation.purchased', 'invoice', v_invoice::text, jsonb_build_object('project', p_project, 'quantity', p_qty, 'total', unit * p_qty));
  return v_invoice;
end;
$$;

-- ---------------------------------------------------------------------------
-- Jadwal
-- ---------------------------------------------------------------------------

-- Jam mulai yang masih bisa dipilih client untuk sesi berdurasi p_minutes dalam rentang waktu tertentu.
-- Tidak membuka siapa yang mengisi jam lain.
create or replace function public.consultation_open_times(p_minutes integer, p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s
  from public.consultation_windows w
  cross join lateral generate_series(w.starts_at, w.ends_at - make_interval(mins => p_minutes), interval '30 minutes') s
  where auth.uid() is not null
    and p_minutes between 15 and 180
    and w.ends_at > p_from and w.starts_at < p_to
    and s >= greatest(p_from, now() + interval '24 hours') and s < p_to
    and not exists (
      select 1 from public.consultations c
      where c.status = 'scheduled' and c.starts_at < s + make_interval(mins => p_minutes) and c.ends_at > s
    )
  order by s;
$$;

-- Memeriksa jam sesi. p_window = harus di dalam rentang waktu kosong admin (untuk booking client).
create or replace function public.consultation_check_time(p_self uuid, p_starts timestamptz, p_minutes integer, p_window boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  ends timestamptz := p_starts + make_interval(mins => p_minutes);
begin
  -- Satu booking diproses bergantian supaya dua client tidak mendapat jam yang sama.
  lock table public.consultations in share row exclusive mode;
  if p_starts is null or extract(minute from p_starts) not in (0, 30) or extract(second from p_starts) <> 0 then
    raise exception 'Jam mulai harus tepat di jam atau setengah jam.' using errcode = '22023';
  end if;
  if p_starts <= now() then
    raise exception 'Jam sesi sudah lewat.' using errcode = '22023';
  end if;
  if p_window and not exists (select 1 from public.consultation_windows where starts_at <= p_starts and ends_at >= ends) then
    raise exception 'Jam ini tidak tersedia. Pilih jam lain di kalender.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.consultations
    where status = 'scheduled' and id is distinct from p_self and starts_at < ends and ends_at > p_starts
  ) then
    raise exception 'Jam ini baru saja terisi. Pilih jam lain.' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.client_book_consultation(p_id uuid, p_starts timestamptz, p_topic text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.consultations;
begin
  select * into c from public.consultations where id = p_id and client_id = auth.uid() for update;
  if not found then
    raise exception 'Jatah konsultasi tidak ditemukan.' using errcode = 'P0002';
  end if;
  if c.status <> 'available' then
    raise exception 'Jatah ini sudah dipakai.' using errcode = '22023';
  end if;
  if c.expires_at <= now() then
    raise exception 'Jatah konsultasi ini sudah kedaluwarsa.' using errcode = '22023';
  end if;
  if p_starts < now() + interval '24 hours' then
    raise exception 'Booking paling lambat 24 jam sebelum sesi.' using errcode = '22023';
  end if;
  if p_starts + make_interval(mins => c.minutes) > c.expires_at then
    raise exception 'Sesi harus berlangsung sebelum jatah berakhir (%).', to_char(c.expires_at at time zone 'Asia/Jakarta', 'DD-MM-YYYY HH24:MI') || ' WIB' using errcode = '22023';
  end if;
  perform public.consultation_check_time(p_id, p_starts, c.minutes, true);

  update public.consultations
  set status = 'scheduled', starts_at = p_starts, ends_at = p_starts + make_interval(mins => c.minutes),
      topic = left(btrim(coalesce(p_topic, '')), 1000), booked_at = now(), status_note = null
  where id = p_id;
  perform public.log_activity('consultation.booked', 'consultation', p_id::text, jsonb_build_object('starts_at', p_starts));
end;
$$;

create or replace function public.client_reschedule_consultation(p_id uuid, p_starts timestamptz)
returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.consultations;
begin
  select * into c from public.consultations where id = p_id and client_id = auth.uid() for update;
  if not found then
    raise exception 'Sesi konsultasi tidak ditemukan.' using errcode = 'P0002';
  end if;
  if c.status <> 'scheduled' then
    raise exception 'Hanya sesi yang terjadwal yang bisa digeser.' using errcode = '22023';
  end if;
  if c.reschedule_count >= 1 then
    raise exception 'Jadwal sesi ini sudah pernah digeser. Hubungi admin kalau perlu mengubahnya lagi.' using errcode = '22023';
  end if;
  if now() > c.starts_at - interval '24 hours' then
    raise exception 'Jadwal hanya bisa digeser paling lambat 24 jam sebelum sesi.' using errcode = '22023';
  end if;
  if p_starts < now() + interval '24 hours' then
    raise exception 'Jadwal baru paling cepat 24 jam dari sekarang.' using errcode = '22023';
  end if;
  if p_starts + make_interval(mins => c.minutes) > c.expires_at then
    raise exception 'Sesi harus berlangsung sebelum jatah berakhir (%).', to_char(c.expires_at at time zone 'Asia/Jakarta', 'DD-MM-YYYY HH24:MI') || ' WIB' using errcode = '22023';
  end if;
  perform public.consultation_check_time(p_id, p_starts, c.minutes, true);

  update public.consultations
  set starts_at = p_starts, ends_at = p_starts + make_interval(mins => c.minutes), reschedule_count = reschedule_count + 1
  where id = p_id;
  perform public.log_activity('consultation.rescheduled', 'consultation', p_id::text, jsonb_build_object('from', c.starts_at, 'to', p_starts, 'by', 'client'));
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------

create or replace function public.admin_add_consultation_window(p_starts timestamptz, p_ends timestamptz)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa mengatur jadwal konsultasi.' using errcode = '42501';
  end if;
  if p_starts is null or p_ends is null or p_ends <= p_starts then
    raise exception 'Jam selesai harus setelah jam mulai.' using errcode = '22023';
  end if;
  if extract(minute from p_starts) not in (0, 30) or extract(minute from p_ends) not in (0, 30)
     or extract(second from p_starts) <> 0 or extract(second from p_ends) <> 0 then
    raise exception 'Jam harus tepat di jam atau setengah jam.' using errcode = '22023';
  end if;
  if p_ends - p_starts > interval '12 hours' then
    raise exception 'Satu rentang waktu maksimal 12 jam.' using errcode = '22023';
  end if;
  if p_ends <= now() then
    raise exception 'Rentang waktu ini sudah lewat.' using errcode = '22023';
  end if;
  if exists (select 1 from public.consultation_windows where starts_at < p_ends and ends_at > p_starts) then
    raise exception 'Rentang waktu ini bertumpuk dengan jadwal kosong lain.' using errcode = '22023';
  end if;
  insert into public.consultation_windows (starts_at, ends_at, created_by) values (p_starts, p_ends, auth.uid()) returning id into v_id;
  perform public.log_activity('consultation.window_added', 'consultation_window', v_id::text, jsonb_build_object('starts_at', p_starts, 'ends_at', p_ends));
  return v_id;
end;
$$;

-- Rentang waktu yang sudah berisi sesi tidak bisa dihapus; geser atau batalkan sesinya dulu.
create or replace function public.admin_delete_consultation_window(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  w public.consultation_windows;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa mengatur jadwal konsultasi.' using errcode = '42501';
  end if;
  select * into w from public.consultation_windows where id = p_id for update;
  if not found then
    raise exception 'Jadwal kosong tidak ditemukan.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.consultations where status = 'scheduled' and starts_at < w.ends_at and ends_at > w.starts_at) then
    raise exception 'Masih ada sesi terjadwal di rentang ini. Geser atau batalkan sesinya dulu.' using errcode = '22023';
  end if;
  delete from public.consultation_windows where id = p_id;
  perform public.log_activity('consultation.window_deleted', 'consultation_window', p_id::text, jsonb_build_object('starts_at', w.starts_at, 'ends_at', w.ends_at));
end;
$$;

create or replace function public.admin_set_consultation_link(p_id uuid, p_url text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.consultations;
  url text := btrim(coalesce(p_url, ''));
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa mengubah sesi konsultasi.' using errcode = '42501';
  end if;
  select * into c from public.consultations where id = p_id for update;
  if not found or c.status <> 'scheduled' then
    raise exception 'Sesi ini tidak sedang terjadwal.' using errcode = '22023';
  end if;
  if url !~ '^https://' or char_length(url) > 500 then
    raise exception 'Link meeting harus diawali https://.' using errcode = '22023';
  end if;
  update public.consultations set meeting_url = url where id = p_id;
  perform public.notify(c.client_id, 'consultation.link', jsonb_build_object('consultation', p_id, 'code', c.code, 'starts_at', c.starts_at));
  perform public.log_activity('consultation.link_set', 'consultation', p_id::text, '{}'::jsonb);
end;
$$;

-- Admin boleh memilih jam di luar jadwal kosong, asal tidak bertumpuk dengan sesi lain.
create or replace function public.admin_reschedule_consultation(p_id uuid, p_starts timestamptz, p_note text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.consultations;
  note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa mengubah sesi konsultasi.' using errcode = '42501';
  end if;
  select * into c from public.consultations where id = p_id for update;
  if not found or c.status <> 'scheduled' then
    raise exception 'Sesi ini tidak sedang terjadwal.' using errcode = '22023';
  end if;
  if note is null then
    raise exception 'Alasan wajib diisi, supaya client tahu kenapa jadwalnya berubah.' using errcode = '22023';
  end if;
  perform public.consultation_check_time(p_id, p_starts, c.minutes, false);
  update public.consultations
  set starts_at = p_starts, ends_at = p_starts + make_interval(mins => c.minutes), status_note = left(note, 500),
      expires_at = greatest(expires_at, p_starts + make_interval(mins => c.minutes))
  where id = p_id;
  perform public.notify(c.client_id, 'consultation.rescheduled', jsonb_build_object('consultation', p_id, 'code', c.code, 'starts_at', p_starts, 'note', left(note, 500)));
  perform public.log_activity('consultation.rescheduled', 'consultation', p_id::text, jsonb_build_object('from', c.starts_at, 'to', p_starts, 'by', 'admin', 'note', note));
end;
$$;

-- Membatalkan sesi terjadwal: jatahnya kembali ke client dan diperpanjang minimal 7 hari supaya bisa dibooking lagi.
create or replace function public.admin_cancel_consultation(p_id uuid, p_note text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.consultations;
  note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa mengubah sesi konsultasi.' using errcode = '42501';
  end if;
  select * into c from public.consultations where id = p_id for update;
  if not found or c.status <> 'scheduled' then
    raise exception 'Sesi ini tidak sedang terjadwal.' using errcode = '22023';
  end if;
  if note is null then
    raise exception 'Alasan wajib diisi.' using errcode = '22023';
  end if;
  update public.consultations
  set status = 'available', starts_at = null, ends_at = null, booked_at = null, meeting_url = '', reschedule_count = 0,
      status_note = left(note, 500), expires_at = greatest(expires_at, now() + interval '7 days')
  where id = p_id;
  perform public.notify(c.client_id, 'consultation.cancelled', jsonb_build_object('consultation', p_id, 'code', c.code, 'note', left(note, 500)));
  perform public.log_activity('consultation.cancelled', 'consultation', p_id::text, jsonb_build_object('starts_at', c.starts_at, 'note', note));
end;
$$;

-- Setelah sesi dimulai: selesai (ringkasan wajib) atau client tidak hadir (jatah tetap terpakai).
create or replace function public.admin_complete_consultation(p_id uuid, p_outcome text, p_summary text, p_action_plan text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.consultations;
  v_summary text := btrim(coalesce(p_summary, ''));
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa mengubah sesi konsultasi.' using errcode = '42501';
  end if;
  select * into c from public.consultations where id = p_id for update;
  if not found or c.status <> 'scheduled' then
    raise exception 'Sesi ini tidak sedang terjadwal.' using errcode = '22023';
  end if;
  if c.starts_at > now() then
    raise exception 'Sesi belum dimulai.' using errcode = '22023';
  end if;
  if p_outcome not in ('done', 'no_show') then
    raise exception 'Hasil sesi tidak valid.' using errcode = '22023';
  end if;
  if p_outcome = 'done' and v_summary = '' then
    raise exception 'Ringkasan sesi wajib diisi.' using errcode = '22023';
  end if;
  update public.consultations
  set status = p_outcome, summary = left(v_summary, 4000), action_plan = left(btrim(coalesce(p_action_plan, '')), 4000),
      completed_at = now(), completed_by = auth.uid()
  where id = p_id;
  perform public.notify(c.client_id, 'consultation.' || p_outcome, jsonb_build_object('consultation', p_id, 'code', c.code));
  perform public.log_activity('consultation.' || p_outcome, 'consultation', p_id::text, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Akses
-- ---------------------------------------------------------------------------

alter table public.consultation_windows enable row level security;
alter table public.consultations enable row level security;

create policy "admin membaca jadwal kosong" on public.consultation_windows for select to authenticated using (public.is_admin());
create policy "admin membaca konsultasi" on public.consultations for select to authenticated using (public.is_admin());
create policy "client membaca konsultasinya" on public.consultations for select to authenticated using (client_id = auth.uid());

revoke all on public.consultation_windows, public.consultations from anon;
revoke insert, update, delete on public.consultation_windows, public.consultations from authenticated;

revoke execute on function public.consultation_addon_minutes() from public, anon, authenticated;
revoke execute on function public.add_consultations(uuid, text, integer, integer, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function public.grant_report_consultations(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.consultations_on_report() from public, anon, authenticated;
revoke execute on function public.consultations_on_payment() from public, anon, authenticated;
revoke execute on function public.consultation_check_time(uuid, timestamptz, integer, boolean) from public, anon, authenticated;

revoke execute on function public.client_buy_consultation(uuid, integer) from public, anon;
grant execute on function public.client_buy_consultation(uuid, integer) to authenticated;
revoke execute on function public.consultation_open_times(integer, timestamptz, timestamptz) from public, anon;
grant execute on function public.consultation_open_times(integer, timestamptz, timestamptz) to authenticated;
revoke execute on function public.client_book_consultation(uuid, timestamptz, text) from public, anon;
grant execute on function public.client_book_consultation(uuid, timestamptz, text) to authenticated;
revoke execute on function public.client_reschedule_consultation(uuid, timestamptz) from public, anon;
grant execute on function public.client_reschedule_consultation(uuid, timestamptz) to authenticated;
revoke execute on function public.admin_add_consultation_window(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_add_consultation_window(timestamptz, timestamptz) to authenticated;
revoke execute on function public.admin_delete_consultation_window(uuid) from public, anon;
grant execute on function public.admin_delete_consultation_window(uuid) to authenticated;
revoke execute on function public.admin_set_consultation_link(uuid, text) from public, anon;
grant execute on function public.admin_set_consultation_link(uuid, text) to authenticated;
revoke execute on function public.admin_reschedule_consultation(uuid, timestamptz, text) from public, anon;
grant execute on function public.admin_reschedule_consultation(uuid, timestamptz, text) to authenticated;
revoke execute on function public.admin_cancel_consultation(uuid, text) from public, anon;
grant execute on function public.admin_cancel_consultation(uuid, text) to authenticated;
revoke execute on function public.admin_complete_consultation(uuid, text, text, text) from public, anon;
grant execute on function public.admin_complete_consultation(uuid, text, text, text) to authenticated;
