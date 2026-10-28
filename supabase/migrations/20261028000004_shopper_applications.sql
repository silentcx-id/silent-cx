-- Fase 2: lamaran dan seleksi shopper.
--
-- Alur: shopper mengisi lamaran (draft) → lulus kuis etika 5 soal dan menyetujui pakta kerahasiaan →
-- lamaran masuk antrian (submitted) → admin menyetujui atau menolak dengan alasan.
-- Tanpa KTP dan selfie. Rekening bank diminta setelah lamaran disetujui.
-- Shopper yang ditolak boleh melamar lagi 30 hari setelah keputusan.
-- Notifikasi hanya di aplikasi; email dan WhatsApp di Fase 5.
-- Semua perubahan lamaran lewat fungsi di bawah, bukan update langsung dari browser.

create type public.application_status as enum ('draft', 'submitted', 'approved', 'rejected');

-- ---------------------------------------------------------------------------
-- Lamaran shopper. Satu baris per percobaan melamar; melamar ulang membuat baris baru.
-- ---------------------------------------------------------------------------

create table public.shopper_applications (
  id uuid primary key default gen_random_uuid(),
  shopper_id uuid not null references public.profiles (id) on delete cascade,
  status public.application_status not null default 'draft',
  domicile text not null default '' check (char_length(domicile) <= 80),
  -- Kota yang bisa dijangkau, diambil dari daftar kota dilayani (nama persis seperti di daftar).
  reachable_cities text[] not null default '{}' check (cardinality(reachable_cities) <= 20),
  birth_date date,
  gender text check (gender is null or gender in ('female', 'male')),
  occupation text not null default '' check (char_length(occupation) <= 80),
  vehicle text check (vehicle is null or vehicle in ('none', 'motorcycle', 'car', 'both')),
  experience text check (experience is null or experience in ('none', 'under_1y', '1_3y', 'over_3y')),
  experience_note text not null default '' check (char_length(experience_note) <= 500),
  industries text[] not null default '{}'
    check (industries <@ array['fnb', 'retail', 'hospitality', 'banking', 'automotive', 'health', 'beauty', 'telco', 'other']::text[]),
  quiz_attempts integer not null default 0,
  quiz_passed_at timestamptz,
  pact_version text,
  pact_accepted_at timestamptz,
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null,
  decision_note text check (decision_note is null or char_length(decision_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Paling banyak satu lamaran terbuka (draft atau sedang ditinjau) per shopper.
create unique index shopper_applications_open_idx on public.shopper_applications (shopper_id) where status in ('draft', 'submitted');
create index shopper_applications_status_idx on public.shopper_applications (status, submitted_at);
-- Pool shopper per kota untuk penugasan di Fase 3.
create index shopper_applications_cities_idx on public.shopper_applications using gin (reachable_cities);

create trigger shopper_applications_touch before update on public.shopper_applications
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Notifikasi di aplikasi. Teksnya disusun dari `kind` dan `detail` sesuai bahasa pengguna.
-- ---------------------------------------------------------------------------

create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind ~ '^[a-z_.]+$'),
  detail jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

create or replace function public.notify(p_user uuid, p_kind text, p_detail jsonb default '{}'::jsonb)
returns void
language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, detail) values (p_user, p_kind, coalesce(p_detail, '{}'::jsonb));
$$;

create or replace function public.mark_notifications_read()
returns void
language sql security definer set search_path = public as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null;
$$;

-- ---------------------------------------------------------------------------
-- Rekening shopper untuk pembayaran fee, diisi setelah lamaran disetujui.
-- ---------------------------------------------------------------------------

create table public.shopper_bank_accounts (
  shopper_id uuid primary key references public.profiles (id) on delete cascade,
  bank_name text not null check (char_length(btrim(bank_name)) between 2 and 60),
  account_number text not null check (account_number ~ '^[0-9]{5,20}$'),
  account_holder text not null check (char_length(btrim(account_holder)) between 2 and 120),
  updated_at timestamptz not null default now()
);

create trigger shopper_bank_accounts_touch before update on public.shopper_bank_accounts
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Fungsi shopper
-- ---------------------------------------------------------------------------

-- Menyimpan isian lamaran sebagai draft. Membuat draft baru kalau belum ada, termasuk melamar ulang
-- setelah 30 hari sejak ditolak. Isian boleh belum lengkap; kelengkapan diperiksa saat dikirim.
-- p_data: { domicile, reachable_cities[], birth_date 'YYYY-MM-DD', gender, occupation, vehicle,
--           experience, experience_note, industries[] }
create or replace function public.save_shopper_application(p_data jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  prof public.profiles;
  app public.shopper_applications;
  last_rejected timestamptz;
  cities text[] := '{}';
  c text;
  canonical text;
begin
  select * into prof from public.profiles where id = auth.uid() for update;
  if not found or prof.role <> 'shopper' then
    raise exception 'Hanya akun shopper yang bisa mengisi lamaran.' using errcode = '42501';
  end if;
  if prof.status = 'suspended' then
    raise exception 'Akun Anda sedang ditangguhkan.' using errcode = '42501';
  end if;
  if prof.status = 'active' then
    raise exception 'Lamaran Anda sudah disetujui.' using errcode = '22023';
  end if;

  select * into app from public.shopper_applications
  where shopper_id = prof.id and status in ('draft', 'submitted') for update;
  if found and app.status = 'submitted' then
    raise exception 'Lamaran sedang ditinjau dan tidak bisa diubah.' using errcode = '22023';
  end if;

  if not found then
    select max(decided_at) into last_rejected from public.shopper_applications where shopper_id = prof.id and status = 'rejected';
    if last_rejected is not null and last_rejected > now() - interval '30 days' then
      raise exception 'Anda bisa melamar lagi mulai %.', to_char((last_rejected + interval '30 days') at time zone 'Asia/Jakarta', 'DD-MM-YYYY')
        using errcode = '22023';
    end if;
    insert into public.shopper_applications (shopper_id) values (prof.id) returning * into app;
    if prof.status = 'rejected' then
      update public.profiles set status = 'pending', status_note = null where id = prof.id;
      perform public.log_activity('application.reapplied', 'profile', prof.id::text, jsonb_build_object('application', app.id));
    end if;
  end if;

  -- Kota dijangkau wajib ada di daftar kota dilayani yang aktif; disimpan dengan nama resminya.
  for c in select btrim(x) from jsonb_array_elements_text(coalesce(p_data -> 'reachable_cities', '[]'::jsonb)) as x where btrim(x) <> '' loop
    select s.name into canonical from public.service_cities s where s.active and lower(btrim(s.name)) = lower(c);
    if canonical is null then
      raise exception 'Kota % tidak ada di daftar kota yang dilayani.', c using errcode = '22023';
    end if;
    if not canonical = any (cities) then
      cities := cities || canonical;
    end if;
  end loop;

  update public.shopper_applications set
    domicile = left(btrim(coalesce(p_data ->> 'domicile', '')), 80),
    reachable_cities = cities,
    birth_date = nullif(p_data ->> 'birth_date', '')::date,
    gender = nullif(p_data ->> 'gender', ''),
    occupation = left(btrim(coalesce(p_data ->> 'occupation', '')), 80),
    vehicle = nullif(p_data ->> 'vehicle', ''),
    experience = nullif(p_data ->> 'experience', ''),
    experience_note = left(btrim(coalesce(p_data ->> 'experience_note', '')), 500),
    industries = coalesce(array(
      select distinct x from jsonb_array_elements_text(coalesce(p_data -> 'industries', '[]'::jsonb)) as x
    ), '{}')
  where id = app.id;

  return app.id;
end;
$$;

-- Mengirim lamaran: isian wajib lengkap, pakta disetujui, dan kuis etika 5 soal dijawab benar semua.
-- Kuis yang belum lulus tidak menggagalkan transaksi supaya jumlah percobaan tercatat; hasilnya
-- dikembalikan sebagai { submitted: false, correct: n }.
-- Kunci jawaban (indeks pilihan, mulai 0) harus sama urutannya dengan soal di src/lib/shopper-application.ts.
create or replace function public.submit_shopper_application(p_answers integer[], p_pact boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  answer_key constant integer[] := array[1, 0, 2, 1, 0];
  prof public.profiles;
  app public.shopper_applications;
  correct integer := 0;
  i integer;
begin
  select * into prof from public.profiles where id = auth.uid();
  if not found or prof.role <> 'shopper' then
    raise exception 'Hanya akun shopper yang bisa mengirim lamaran.' using errcode = '42501';
  end if;
  if prof.status <> 'pending' then
    raise exception 'Akun ini tidak sedang melamar.' using errcode = '22023';
  end if;

  select * into app from public.shopper_applications where shopper_id = prof.id and status = 'draft' for update;
  if not found then
    raise exception 'Isi dan simpan formulir lamaran dulu.' using errcode = '22023';
  end if;

  if btrim(prof.full_name) = '' or prof.phone is null then
    raise exception 'Lengkapi nama dan nomor WhatsApp.' using errcode = '22023';
  end if;
  if app.domicile = '' or app.occupation = '' or app.gender is null or app.vehicle is null or app.experience is null then
    raise exception 'Lengkapi domisili, gender, pekerjaan, kendaraan, dan pengalaman.' using errcode = '22023';
  end if;
  if cardinality(app.reachable_cities) = 0 then
    raise exception 'Pilih minimal satu kota yang bisa Anda jangkau.' using errcode = '22023';
  end if;
  if cardinality(app.industries) = 0 then
    raise exception 'Pilih minimal satu industri yang Anda minati.' using errcode = '22023';
  end if;
  if app.birth_date is null or app.birth_date > (now() at time zone 'Asia/Jakarta')::date - interval '18 years' or app.birth_date < date '1940-01-01' then
    raise exception 'Usia pelamar minimal 18 tahun. Periksa tanggal lahir.' using errcode = '22023';
  end if;
  if not coalesce(p_pact, false) then
    raise exception 'Setujui pakta kerahasiaan untuk mengirim lamaran.' using errcode = '22023';
  end if;
  if p_answers is null or cardinality(p_answers) <> cardinality(answer_key) then
    raise exception 'Jawab semua soal kuis.' using errcode = '22023';
  end if;

  for i in 1 .. cardinality(answer_key) loop
    if p_answers[i] = answer_key[i] then
      correct := correct + 1;
    end if;
  end loop;

  if correct < cardinality(answer_key) then
    update public.shopper_applications set quiz_attempts = quiz_attempts + 1 where id = app.id;
    return jsonb_build_object('submitted', false, 'correct', correct, 'total', cardinality(answer_key));
  end if;

  update public.shopper_applications set
    quiz_attempts = quiz_attempts + 1,
    quiz_passed_at = now(),
    pact_version = 'v1',
    pact_accepted_at = now(),
    status = 'submitted',
    submitted_at = now()
  where id = app.id;
  perform public.log_activity('application.submitted', 'application', app.id::text,
    jsonb_build_object('shopper', prof.id, 'quiz_attempts', app.quiz_attempts + 1));
  return jsonb_build_object('submitted', true, 'correct', correct, 'total', cardinality(answer_key));
end;
$$;

-- Rekening untuk pembayaran fee. Hanya shopper aktif (lamaran sudah disetujui).
create or replace function public.save_bank_account(p_bank text, p_number text, p_holder text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  prof public.profiles;
  num text := regexp_replace(coalesce(p_number, ''), '[\s-]', '', 'g');
begin
  select * into prof from public.profiles where id = auth.uid();
  if not found or prof.role <> 'shopper' or prof.status <> 'active' then
    raise exception 'Rekening bisa diisi setelah lamaran disetujui.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_bank, ''))) < 2 or char_length(btrim(coalesce(p_holder, ''))) < 2 then
    raise exception 'Isi nama bank dan nama pemilik rekening.' using errcode = '22023';
  end if;
  if num !~ '^[0-9]{5,20}$' then
    raise exception 'Nomor rekening harus 5 sampai 20 angka.' using errcode = '22023';
  end if;

  insert into public.shopper_bank_accounts (shopper_id, bank_name, account_number, account_holder)
  values (prof.id, left(btrim(p_bank), 60), num, left(btrim(p_holder), 120))
  on conflict (shopper_id) do update
    set bank_name = excluded.bank_name, account_number = excluded.account_number, account_holder = excluded.account_holder;

  -- Nomor rekening tidak ikut dicatat di log.
  perform public.log_activity('shopper.bank_updated', 'profile', prof.id::text, jsonb_build_object('bank', left(btrim(p_bank), 60)));
end;
$$;

-- ---------------------------------------------------------------------------
-- Fungsi admin
-- ---------------------------------------------------------------------------

-- Menyetujui atau menolak lamaran yang sedang ditinjau. Menolak wajib dengan alasan, yang dilihat pelamar.
-- Status akun ikut berubah (aktif atau ditolak), dan pelamar mendapat notifikasi.
create or replace function public.admin_decide_application(p_application uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  app public.shopper_applications;
  prof public.profiles;
  note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa memutuskan lamaran.' using errcode = '42501';
  end if;
  select * into app from public.shopper_applications where id = p_application for update;
  if not found then
    raise exception 'Lamaran tidak ditemukan.' using errcode = 'P0002';
  end if;
  if app.status <> 'submitted' then
    raise exception 'Lamaran ini tidak sedang ditinjau.' using errcode = '22023';
  end if;
  select * into prof from public.profiles where id = app.shopper_id for update;
  if prof.status <> 'pending' then
    raise exception 'Akun pelamar tidak berstatus menunggu seleksi.' using errcode = '22023';
  end if;
  if not p_approve and note is null then
    raise exception 'Alasan wajib diisi.' using errcode = '22023';
  end if;
  if note is not null and char_length(note) > 500 then
    raise exception 'Alasan maksimal 500 karakter.' using errcode = '22023';
  end if;

  update public.shopper_applications set
    status = case when p_approve then 'approved' else 'rejected' end::public.application_status,
    decided_at = now(),
    decided_by = auth.uid(),
    decision_note = note
  where id = app.id;
  update public.profiles set
    status = case when p_approve then 'active' else 'rejected' end::public.account_status,
    status_note = case when p_approve then null else note end
  where id = prof.id;

  perform public.log_activity(case when p_approve then 'application.approved' else 'application.rejected' end,
    'application', app.id::text, jsonb_build_object('shopper', prof.id, 'note', note));
  perform public.notify(prof.id, case when p_approve then 'application.approved' else 'application.rejected' end,
    case when p_approve then '{}'::jsonb
         else jsonb_build_object('note', note, 'reapply_at', now() + interval '30 days') end);
end;
$$;

-- Status akun dari Fase 0, kini hanya untuk menangguhkan dan mengaktifkan kembali.
-- Pelamar shopper diputuskan lewat lamarannya (admin_decide_application), supaya tidak ada yang
-- aktif tanpa lulus kuis dan menyetujui pakta kerahasiaan.
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
  if target.role = 'shopper' and target.status in ('pending', 'rejected') then
    raise exception 'Pelamar shopper disetujui atau ditolak lewat lamarannya di antrian seleksi.' using errcode = '22023';
  end if;

  if not (
    (target.status = 'active' and p_status = 'suspended')
    or (target.status = 'suspended' and p_status = 'active')
  ) then
    raise exception 'Perubahan status dari % ke % tidak diizinkan.', target.status, p_status using errcode = '22023';
  end if;

  if p_status = 'suspended' and note is null then
    raise exception 'Alasan wajib diisi.' using errcode = '22023';
  end if;
  if note is not null and char_length(note) > 500 then
    raise exception 'Alasan maksimal 500 karakter.' using errcode = '22023';
  end if;

  update public.profiles
  set status = p_status,
      status_note = case when p_status = 'suspended' then note else null end
  where id = p_user;

  perform public.log_activity('account.status_changed', 'profile', p_user::text,
    jsonb_build_object('from', target.status, 'to', p_status, 'note', note));
end;
$$;

-- ---------------------------------------------------------------------------
-- Hak akses
-- ---------------------------------------------------------------------------

alter table public.shopper_applications enable row level security;
alter table public.notifications enable row level security;
alter table public.shopper_bank_accounts enable row level security;

create policy "shopper membaca lamarannya" on public.shopper_applications for select to authenticated
  using (shopper_id = auth.uid() or public.is_admin());
create policy "pemilik membaca notifikasinya" on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy "shopper membaca rekeningnya" on public.shopper_bank_accounts for select to authenticated
  using (shopper_id = auth.uid() or public.is_admin());

revoke all on public.shopper_applications, public.notifications, public.shopper_bank_accounts from anon;
revoke insert, update, delete on public.shopper_applications, public.notifications, public.shopper_bank_accounts from authenticated;

revoke execute on function public.notify(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.mark_notifications_read() from public, anon;
grant execute on function public.mark_notifications_read() to authenticated;
revoke execute on function public.save_shopper_application(jsonb) from public, anon;
grant execute on function public.save_shopper_application(jsonb) to authenticated;
revoke execute on function public.submit_shopper_application(integer[], boolean) from public, anon;
grant execute on function public.submit_shopper_application(integer[], boolean) to authenticated;
revoke execute on function public.save_bank_account(text, text, text) from public, anon;
grant execute on function public.save_bank_account(text, text, text) to authenticated;
revoke execute on function public.admin_decide_application(uuid, boolean, text) from public, anon;
grant execute on function public.admin_decide_application(uuid, boolean, text) to authenticated;
