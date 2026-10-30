-- Putaran 9: semua fitur di daftar harga masuk ke laporan.
--
-- 1. Kuesioner: pertanyaan bisa ditandai SOP (Ya/Tidak), red flag, dan tahap customer journey. Tahap journey
--    diatur admin per jenis usaha. Setiap bagian punya target skor (bawaan 85) untuk analisis gap.
--    Paket dengan fitur SOP (Insight, Performance) hanya bisa memakai kuesioner yang punya pertanyaan SOP dan
--    tahap journey; Performance juga butuh pertanyaan red flag.
-- 2. Laporan: kepatuhan SOP, customer journey, analisis gap, SOP dan red flag per outlet, dan perbandingan
--    dengan audit sebelumnya untuk audit ulang.
-- 3. Add-on: kunjungan tambahan dibagikan client ke outlet yang sudah bernama; laporan express (2 hari kerja,
--    biasa 5 hari kerja setelah kunjungan terakhir lolos QC); audit ulang dipesan setelah laporan terbit dan
--    kunjungannya paling cepat 30 hari setelah laporan terbit; kuesioner khusus dengan brief dari client.

-- ---------------------------------------------------------------------------
-- 1. Kuesioner
-- ---------------------------------------------------------------------------

create table public.journey_stages (
  id uuid primary key default gen_random_uuid(),
  business_type text not null references public.business_types (key) on delete cascade,
  position integer not null default 1,
  title text not null check (char_length(btrim(title)) between 2 and 80),
  -- Petunjuk untuk admin: apa yang diamati di tahap ini.
  hint text not null default '' check (char_length(hint) <= 300),
  created_at timestamptz not null default now()
);

create unique index journey_stages_title_idx on public.journey_stages (business_type, lower(btrim(title)));
create index journey_stages_type_idx on public.journey_stages (business_type, position);

alter table public.journey_stages enable row level security;
create policy "admin mengelola tahap journey" on public.journey_stages for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.journey_stages from anon;

-- Contoh alur untuk setiap jenis usaha bawaan. Admin bisa mengubah, menambah, atau menghapusnya.
insert into public.journey_stages (business_type, position, title, hint)
select v.type, v.pos, v.title, v.hint
from (values
  ('fnb', 1, 'Kedatangan dan sapaan', 'Disambut, diarahkan ke meja atau antrean, waktu sampai disapa.'),
  ('fnb', 2, 'Pemesanan', 'Penjelasan menu, rekomendasi, upselling, ketepatan pencatatan.'),
  ('fnb', 3, 'Menunggu pesanan', 'Waktu tunggu, informasi keterlambatan, kebersihan area duduk.'),
  ('fnb', 4, 'Penyajian dan konsumsi', 'Kesesuaian pesanan, suhu, tampilan, rasa, pengecekan oleh staf.'),
  ('fnb', 5, 'Pembayaran', 'Kecepatan kasir, ketepatan tagihan, pilihan pembayaran, struk.'),
  ('fnb', 6, 'Kepergian', 'Ucapan terima kasih, ajakan datang lagi.'),
  ('retail', 1, 'Masuk toko dan sapaan', 'Waktu sampai disapa, kerapian pintu masuk.'),
  ('retail', 2, 'Menjelajah produk', 'Kerapian rak, label harga, ketersediaan ukuran atau stok.'),
  ('retail', 3, 'Konsultasi dan rekomendasi', 'Pertanyaan kebutuhan, pengetahuan produk, saran alternatif.'),
  ('retail', 4, 'Mencoba produk', 'Fitting room, demo, bantuan selama mencoba.'),
  ('retail', 5, 'Kasir dan pembayaran', 'Antrean, tawaran tambahan, member, ketepatan transaksi.'),
  ('retail', 6, 'Purnajual dan salam', 'Info garansi atau penukaran, ucapan terima kasih.'),
  ('hospitality', 1, 'Reservasi', 'Kemudahan pemesanan, konfirmasi, kejelasan harga.'),
  ('hospitality', 2, 'Check-in', 'Waktu tunggu, sapaan, penjelasan fasilitas.'),
  ('hospitality', 3, 'Kamar dan fasilitas', 'Kebersihan, kelengkapan, fungsi perangkat.'),
  ('hospitality', 4, 'Layanan selama menginap', 'Respons permintaan, room service, restoran.'),
  ('hospitality', 5, 'Check-out', 'Kecepatan, ketepatan tagihan, ajakan kembali.'),
  ('banking', 1, 'Kedatangan dan keamanan', 'Sapaan satpam, arahan ke layanan yang tepat.'),
  ('banking', 2, 'Antrean', 'Sistem nomor, waktu tunggu, kenyamanan ruang tunggu.'),
  ('banking', 3, 'Layanan teller atau CS', 'Sapaan baku, verifikasi identitas, ketepatan transaksi.'),
  ('banking', 4, 'Penjelasan produk', 'Pengetahuan produk, transparansi biaya, tawaran yang sesuai.'),
  ('banking', 5, 'Penutupan', 'Konfirmasi kebutuhan lain, salam penutup.'),
  ('automotive', 1, 'Kedatangan dan sambutan', 'Waktu sampai disambut, parkir, ruang tunggu.'),
  ('automotive', 2, 'Identifikasi kebutuhan', 'Pertanyaan kebutuhan, anggaran, penggunaan.'),
  ('automotive', 3, 'Presentasi produk', 'Penjelasan fitur, perbandingan tipe, brosur.'),
  ('automotive', 4, 'Test drive', 'Tawaran test drive, pendampingan, keamanan.'),
  ('automotive', 5, 'Penawaran dan negosiasi', 'Simulasi harga atau kredit, promo, kejelasan biaya.'),
  ('automotive', 6, 'Tindak lanjut', 'Kontak setelah kunjungan, janji temu berikutnya.'),
  ('health', 1, 'Pendaftaran', 'Kemudahan daftar, kejelasan biaya, waktu tunggu.'),
  ('health', 2, 'Ruang tunggu', 'Kebersihan, informasi antrean, kenyamanan.'),
  ('health', 3, 'Pemeriksaan', 'Sikap tenaga medis, penjelasan diagnosis, privasi.'),
  ('health', 4, 'Farmasi dan pembayaran', 'Penjelasan obat, ketepatan tagihan.'),
  ('health', 5, 'Kepulangan dan tindak lanjut', 'Jadwal kontrol, kontak darurat, salam.'),
  ('beauty', 1, 'Reservasi dan kedatangan', 'Kemudahan booking, ketepatan jadwal, sapaan.'),
  ('beauty', 2, 'Konsultasi kebutuhan', 'Pertanyaan kondisi, rekomendasi perawatan, harga.'),
  ('beauty', 3, 'Perawatan', 'Kebersihan alat, kenyamanan, keahlian terapis.'),
  ('beauty', 4, 'Rekomendasi produk', 'Tawaran produk perawatan rumah yang relevan.'),
  ('beauty', 5, 'Pembayaran dan janji berikutnya', 'Ketepatan tagihan, tawaran jadwal berikutnya.'),
  ('telco', 1, 'Kedatangan dan antrean', 'Sapaan, sistem antrean, waktu tunggu.'),
  ('telco', 2, 'Identifikasi kebutuhan', 'Pertanyaan pemakaian, keluhan, kebutuhan paket.'),
  ('telco', 3, 'Penjelasan produk atau paket', 'Perbandingan paket, transparansi biaya, promo.'),
  ('telco', 4, 'Transaksi dan aktivasi', 'Kecepatan proses, verifikasi data, uji aktivasi.'),
  ('telco', 5, 'Penutupan', 'Info layanan purnajual, salam penutup.'),
  ('other', 1, 'Kedatangan', 'Sapaan pertama dan arahan.'),
  ('other', 2, 'Layanan inti', 'Pemahaman kebutuhan dan penyampaian layanan.'),
  ('other', 3, 'Pembayaran', 'Ketepatan dan kecepatan transaksi.'),
  ('other', 4, 'Kepergian', 'Ucapan terima kasih dan ajakan kembali.')
) as v(type, pos, title, hint)
where exists (select 1 from public.business_types b where b.key = v.type);

alter table public.questionnaire_sections
  -- Target skor bagian untuk analisis gap.
  add column target integer not null default 85 check (target between 0 and 100);

alter table public.questionnaire_questions
  -- Pertanyaan kepatuhan SOP: dijawab Ya (patuh) atau Tidak (melanggar).
  add column is_sop boolean not null default false,
  -- Jawaban Tidak, atau skala 1–2, ditandai red flag di laporan. Tidak memotong skor.
  add column red_flag boolean not null default false,
  add column journey_stage_id uuid references public.journey_stages (id) on delete set null,
  add constraint questionnaire_questions_sop_kind check (not is_sop or kind = 'yes_no'),
  add constraint questionnaire_questions_red_flag_kind check (not red_flag or kind <> 'text');

-- Template bawaan "Kafe & restoran — dasar" langsung ditandai SOP, red flag, dan tahap journey F&B.
update public.questionnaire_questions q
set is_sop = v.sop, red_flag = v.flag,
    journey_stage_id = (select js.id from public.journey_stages js where js.business_type = 'fnb' and js.title = v.stage)
from (values
  ('Staf menyapa dalam 10 detik setelah Anda masuk.', true, false, 'Kedatangan dan sapaan'),
  ('Staf tersenyum dan melakukan kontak mata.', false, false, 'Kedatangan dan sapaan'),
  ('Keramahan staf secara keseluruhan.', false, false, 'Kedatangan dan sapaan'),
  ('Staf bisa menjelaskan menu andalan saat ditanya.', false, false, 'Pemesanan'),
  ('Staf memberi rekomendasi sesuai permintaan Anda.', false, false, 'Pemesanan'),
  ('Kejelasan penjelasan produk.', false, false, 'Pemesanan'),
  ('Staf mengulang pesanan sebelum diproses.', true, false, 'Pemesanan'),
  ('Staf menawarkan menu tambahan atau ukuran lebih besar.', true, false, 'Pemesanan'),
  ('Waktu tunggu sampai pesanan diterima wajar (di bawah 15 menit).', false, false, 'Menunggu pesanan'),
  ('Meja dan kursi bersih saat Anda duduk.', false, true, 'Menunggu pesanan'),
  ('Kenyamanan suasana (suhu, musik, pencahayaan).', false, false, 'Menunggu pesanan'),
  ('Pesanan yang diterima sesuai dengan yang dipesan.', false, true, 'Penyajian dan konsumsi'),
  ('Nominal di struk sesuai harga menu.', true, true, 'Pembayaran'),
  ('Antrian di kasir tertangani dengan baik.', false, false, 'Pembayaran'),
  ('Area kasir dan display produk rapi.', false, false, 'Pembayaran'),
  ('Staf mengucapkan terima kasih dan mengajak kembali.', true, false, 'Kepergian')
) as v(prompt, sop, flag, stage), public.questionnaire_sections sec, public.questionnaires qn
where q.prompt = v.prompt and sec.id = q.section_id and qn.id = sec.questionnaire_id
  and qn.name = 'Kafe & restoran — dasar' and qn.business_type = 'fnb';

-- Salinan kuesioner kini memuat target bagian serta tanda SOP, red flag, dan tahap journey.
create or replace function public.questionnaire_snapshot(p_questionnaire uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', qn.id, 'name', qn.name, 'business_type', qn.business_type, 'photo_limit', qn.photo_limit,
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sec.id, 'title', sec.title, 'weight', sec.weight, 'target', sec.target,
        'questions', coalesce((
          select jsonb_agg(jsonb_build_object('id', q.id, 'prompt', q.prompt, 'help', q.help, 'kind', q.kind, 'photo_required', q.photo_required,
                                              'sop', q.is_sop, 'red_flag', q.red_flag, 'stage', js.title, 'stage_pos', js.position)
                           order by q.position, q.prompt)
          from public.questionnaire_questions q left join public.journey_stages js on js.id = q.journey_stage_id
          where q.section_id = sec.id
        ), '[]'::jsonb)
      ) order by sec.position, sec.title)
      from public.questionnaire_sections sec where sec.questionnaire_id = qn.id
    ), '[]'::jsonb)
  )
  from public.questionnaires qn where qn.id = p_questionnaire;
$$;

-- Masalah kuesioner (Fase 3), ditambah tahap journey yang bukan milik jenis usaha kuesioner.
create or replace function public.questionnaire_issues(p_questionnaire uuid)
returns text[]
language plpgsql stable security definer set search_path = public as $$
declare
  qn public.questionnaires;
  issues text[] := '{}';
  total integer;
  photos integer;
  foreign_stages integer;
  s record;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa memeriksa kuesioner.' using errcode = '42501';
  end if;
  select * into qn from public.questionnaires where id = p_questionnaire;
  if not found then
    raise exception 'Kuesioner tidak ditemukan.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.questionnaire_sections where questionnaire_id = qn.id) then
    return array['Belum ada bagian.'];
  end if;

  select coalesce(sum(weight), 0) into total from public.questionnaire_sections where questionnaire_id = qn.id;
  if total <> 100 then
    issues := issues || format('Total bobot %s, harus 100.', total);
  end if;

  for s in
    select sec.title, sec.weight,
           count(q.id) as questions,
           count(q.id) filter (where q.kind <> 'text') as scored
    from public.questionnaire_sections sec
    left join public.questionnaire_questions q on q.section_id = sec.id
    where sec.questionnaire_id = qn.id
    group by sec.id, sec.title, sec.weight, sec.position
    order by sec.position
  loop
    if s.questions = 0 then
      issues := issues || format('Bagian "%s" belum punya pertanyaan.', s.title);
    elsif s.weight > 0 and s.scored = 0 then
      issues := issues || format('Bagian "%s" berbobot tapi tidak punya pertanyaan yang dinilai.', s.title);
    end if;
  end loop;

  select count(*) into photos
  from public.questionnaire_questions q join public.questionnaire_sections sec on sec.id = q.section_id
  where sec.questionnaire_id = qn.id and q.photo_required;
  if photos > qn.photo_limit - 2 then
    issues := issues || format('Pertanyaan wajib foto %s, maksimal %s untuk batas %s foto (1 check-in dan 1 struk sudah termasuk).',
      photos, qn.photo_limit - 2, qn.photo_limit);
  end if;

  select count(*) into foreign_stages
  from public.questionnaire_questions q
  join public.questionnaire_sections sec on sec.id = q.section_id
  join public.journey_stages js on js.id = q.journey_stage_id
  where sec.questionnaire_id = qn.id and js.business_type <> qn.business_type;
  if foreign_stages > 0 then
    issues := issues || format('%s pertanyaan memakai tahap customer journey dari jenis usaha lain. Pilih ulang tahapnya.', foreign_stages);
  end if;
  return issues;
end;
$$;

-- Syarat isi kuesioner sesuai fitur paket. Dipakai saat menetapkan kuesioner dan sebelum laporan terbit.
create or replace function public.snapshot_feature_issues(p_snapshot jsonb, p_entitlements text[])
returns text[]
language plpgsql immutable as $$
declare
  issues text[] := '{}';
  sop integer;
  stages integer;
  flags integer;
begin
  select count(*) filter (where coalesce((q ->> 'sop')::boolean, false)),
         count(distinct q ->> 'stage') filter (where q ->> 'stage' is not null and q ->> 'kind' <> 'text'),
         count(*) filter (where coalesce((q ->> 'red_flag')::boolean, false))
  into sop, stages, flags
  from jsonb_array_elements(coalesce(p_snapshot -> 'sections', '[]'::jsonb)) s,
       jsonb_array_elements(coalesce(s -> 'questions', '[]'::jsonb)) q;
  if 'sop' = any(p_entitlements) then
    if sop = 0 then
      issues := issues || 'Kuesioner belum punya pertanyaan SOP (wajib untuk paket ini).'::text;
    end if;
    if stages < 2 then
      issues := issues || 'Tandai tahap customer journey di pertanyaan yang dinilai, minimal 2 tahap (wajib untuk paket ini).'::text;
    end if;
  end if;
  if 'benchmarking' = any(p_entitlements) and flags = 0 then
    issues := issues || 'Kuesioner belum punya pertanyaan red flag (wajib untuk paket Performance).'::text;
  end if;
  return issues;
end;
$$;

create or replace function public.admin_assign_questionnaire(p_project uuid, p_questionnaire uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  proj public.projects;
  issues text[];
  snap jsonb;
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
  snap := public.questionnaire_snapshot(p_questionnaire);
  issues := public.snapshot_feature_issues(snap, proj.entitlements);
  if cardinality(issues) > 0 then
    raise exception 'Kuesioner belum sesuai paket %: %', proj.package_snapshot ->> 'name', array_to_string(issues, ' ') using errcode = '22023';
  end if;

  insert into public.project_questionnaires (project_id, questionnaire_id, snapshot, assigned_by)
  values (p_project, p_questionnaire, snap, auth.uid())
  on conflict (project_id) do update
    set questionnaire_id = excluded.questionnaire_id, snapshot = excluded.snapshot, assigned_at = now(), assigned_by = excluded.assigned_by;
  perform public.log_activity('project.questionnaire_assigned', 'project', p_project::text, jsonb_build_object('questionnaire', p_questionnaire));
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Kolom proyek untuk add-on
-- ---------------------------------------------------------------------------

alter table public.project_outlets
  -- Kunjungan tambahan yang dibagikan client ke outlet ini (add-on Kunjungan tambahan).
  add column extra_visits integer not null default 0 check (extra_visits between 0 and 20);

alter table public.projects
  -- Brief kuesioner khusus dari client (add-on Kuesioner khusus).
  add column custom_brief text not null default '' check (char_length(custom_brief) <= 2000),
  -- Proyek audit ulang merujuk ke proyek yang laporannya sudah terbit.
  add column parent_project_id uuid references public.projects (id) on delete set null;

create index projects_parent_idx on public.projects (parent_project_id) where parent_project_id is not null;

alter table public.addons
  -- Hanya bisa dipesan dari halaman laporan setelah laporan terbit (Audit ulang), tidak di checkout paket.
  add column after_report boolean not null default false;
update public.addons set after_report = true where key = 're_audit';

-- Jumlah kunjungan tambahan yang dibeli.
create or replace function public.extra_visit_allowance(p_project uuid)
returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(sum((a ->> 'quantity')::integer), 0)::integer
  from public.projects p, jsonb_array_elements(p.addons_snapshot) a
  where p.id = p_project and a ->> 'item_key' = 'additional_visit';
$$;

-- Kunjungan yang direncanakan untuk satu outlet: kunjungan paket ditambah kunjungan tambahan. Kompetitor 1 kali.
create or replace function public.outlet_visits_planned(p_outlet uuid)
returns integer
language sql stable security definer set search_path = public as $$
  select case when o.is_competitor then 1 else coalesce((p.package_snapshot ->> 'visits')::integer, 1) + o.extra_visits end
  from public.project_outlets o join public.projects p on p.id = o.project_id
  where o.id = p_outlet;
$$;

-- Client membagikan kunjungan tambahan: [{ outlet_id, extra }]. Outlet yang sudah dijadwalkan terkunci.
create or replace function public.client_save_extra_visits(p_project uuid, p_items jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  proj public.projects;
  allowance integer;
  item jsonb;
  o public.project_outlets;
  v integer;
  total integer := 0;
begin
  select * into proj from public.projects where id = p_project and client_id = auth.uid() for update;
  if not found then
    raise exception 'Proyek tidak ditemukan.' using errcode = 'P0002';
  end if;
  if proj.status <> 'active' then
    raise exception 'Kunjungan tambahan bisa dibagikan setelah pembayaran diverifikasi.' using errcode = '22023';
  end if;
  allowance := public.extra_visit_allowance(p_project);
  if allowance = 0 then
    raise exception 'Pesanan ini tidak termasuk kunjungan tambahan.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Data kunjungan tambahan tidak valid.' using errcode = '22023';
  end if;

  for item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    select * into o from public.project_outlets where id = nullif(item ->> 'outlet_id', '')::uuid and project_id = p_project and not is_competitor;
    if not found then
      raise exception 'Outlet tidak valid.' using errcode = '22023';
    end if;
    v := coalesce((item ->> 'extra')::integer, 0);
    if v < 0 or v > allowance then
      raise exception 'Jumlah kunjungan tambahan tidak valid.' using errcode = '22023';
    end if;
    total := total + v;
    if v <> o.extra_visits then
      if exists (select 1 from public.audit_tasks t where t.outlet_id = o.id and t.status <> 'cancelled') then
        raise exception 'Kunjungan untuk outlet "%" sudah dijadwalkan, jadi pembagiannya tidak bisa diubah lagi.', coalesce(nullif(o.name, ''), o.city) using errcode = '22023';
      end if;
      update public.project_outlets set extra_visits = v where id = o.id;
    end if;
  end loop;

  select coalesce(sum(extra_visits), 0) into total from public.project_outlets where project_id = p_project and not is_competitor;
  if total > allowance then
    raise exception 'Anda membeli % kunjungan tambahan, tetapi membagikan %.', allowance, total using errcode = '22023';
  end if;
  perform public.log_activity('project.extra_visits_saved', 'project', p_project::text, jsonb_build_object('total', total));
end;
$$;

-- Brief kuesioner khusus.
create or replace function public.client_save_brief(p_project uuid, p_brief text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if char_length(coalesce(p_brief, '')) > 2000 then
    raise exception 'Kebutuhan kuesioner maksimal 2000 karakter.' using errcode = '22023';
  end if;
  update public.projects set custom_brief = btrim(coalesce(p_brief, ''))
  where id = p_project and client_id = auth.uid() and status = 'active' and 'custom_scope' = any(entitlements);
  if not found then
    raise exception 'Proyek tidak ditemukan atau tidak termasuk kuesioner khusus.' using errcode = '22023';
  end if;
end;
$$;

-- Data lengkap: syarat sebelumnya, ditambah kunjungan tambahan terbagi semua dan brief kuesioner khusus terisi.
create or replace function public.complete_project_details(p_project uuid, p_objectives text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  proj public.projects;
  comp public.companies;
  allowance integer;
  extra integer;
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
  allowance := public.extra_visit_allowance(p_project);
  select coalesce(sum(extra_visits), 0) into extra from public.project_outlets where project_id = p_project and not is_competitor;
  if extra <> allowance then
    raise exception 'Bagikan % kunjungan tambahan ke outlet Anda (baru % yang dibagikan).', allowance, extra using errcode = '22023';
  end if;
  if 'custom_scope' = any(proj.entitlements) and char_length(btrim(proj.custom_brief)) < 20 then
    raise exception 'Tulis kebutuhan kuesioner khusus, minimal 20 karakter.' using errcode = '22023';
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
-- 3. Perkiraan laporan terbit (biasa 5 hari kerja, express 2 hari kerja)
-- ---------------------------------------------------------------------------

-- Menambah hari kerja (Senin–Jumat) dari tanggal WIB.
create or replace function public.add_working_days(p_from timestamptz, p_days integer)
returns date
language plpgsql immutable as $$
declare
  d date := (p_from at time zone 'Asia/Jakarta')::date;
  n integer := 0;
begin
  while n < p_days loop
    d := d + 1;
    if extract(isodow from d) < 6 then
      n := n + 1;
    end if;
  end loop;
  return d;
end;
$$;

-- { express, days, all_done, last_qc, due }. due terisi setelah semua kunjungan yang direncanakan lolos QC.
create or replace function public.project_report_eta(p_project uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  proj public.projects;
  express boolean;
  days integer;
  pending integer;
  last_qc timestamptz;
begin
  select * into proj from public.projects where id = p_project;
  if not found or not (public.is_admin() or proj.client_id = auth.uid()) then
    return null;
  end if;
  express := 'priority' = any(proj.entitlements);
  days := case when express then 2 else 5 end;
  select count(*) into pending from public.project_outlets o
  where o.project_id = p_project
    and (select count(*) from public.audit_tasks t where t.outlet_id = o.id and t.status = 'approved') < public.outlet_visits_planned(o.id);
  select max(qc_decided_at) into last_qc from public.audit_tasks where project_id = p_project and status = 'approved';
  return jsonb_build_object(
    'express', express, 'days', days, 'all_done', pending = 0,
    'last_qc', last_qc,
    'due', case when pending = 0 and last_qc is not null then public.add_working_days(last_qc, days) end
  );
end;
$$;

-- Tanggal paling cepat kunjungan audit ulang: 30 hari setelah laporan proyek asal terbit.
create or replace function public.reaudit_earliest_visit(p_project uuid)
returns date
language sql stable security definer set search_path = public as $$
  select ((r.published_at at time zone 'Asia/Jakarta')::date + 30)
  from public.projects p join public.reports r on r.project_id = p.parent_project_id and r.status = 'published'
  where p.id = p_project;
$$;

-- Progres audit client: kunjungan per outlet kini termasuk kunjungan tambahan; ditambah perkiraan laporan
-- dan tanggal paling cepat kunjungan audit ulang.
create or replace function public.client_audit_progress()
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'project_id', p.id, 'project_code', p.code, 'project_status', p.status, 'outlet_id', o.id, 'position', o.position, 'name', o.name, 'city', o.city,
    'is_competitor', o.is_competitor,
    'visits_planned', public.outlet_visits_planned(o.id),
    'extra_visits', o.extra_visits,
    'scheduled', (select count(*) from public.audit_tasks t where t.outlet_id = o.id and t.status in ('open', 'offered', 'accepted', 'in_progress')),
    'awaiting_qc', (select count(*) from public.audit_tasks t where t.outlet_id = o.id and t.status in ('submitted', 'revision')),
    'approved', (select count(*) from public.audit_tasks t where t.outlet_id = o.id and t.status = 'approved'),
    'report_eta', public.project_report_eta(p.id),
    'earliest_visit', public.reaudit_earliest_visit(p.id)
  ) order by p.created_at desc, o.position), '[]'::jsonb)
  from public.projects p
  join public.project_outlets o on o.project_id = p.id
  where p.client_id = auth.uid() and p.status in ('active', 'reporting', 'completed');
$$;

-- ---------------------------------------------------------------------------
-- 4. Audit ulang
-- ---------------------------------------------------------------------------

-- Add-on yang hanya bisa dipesan setelah laporan terbit tidak boleh masuk pesanan paket biasa.
create or replace function public.check_after_report_addons() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.parent_project_id is null and exists (
    select 1 from jsonb_array_elements(new.addons_snapshot) l join public.addons a on a.key = l ->> 'item_key' where a.after_report
  ) then
    raise exception 'Audit ulang dipesan dari halaman laporan setelah laporan terbit.' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke execute on function public.check_after_report_addons() from public, anon, authenticated;

create trigger projects_after_report_addons before insert on public.projects
  for each row execute function public.check_after_report_addons();

-- Jendela kunjungan audit ulang paling cepat 30 hari setelah laporan sebelumnya terbit.
create or replace function public.check_reaudit_window() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  earliest date := public.reaudit_earliest_visit(new.project_id);
begin
  if earliest is not null and new.window_start < earliest then
    raise exception 'Kunjungan audit ulang paling cepat %, 30 hari setelah laporan sebelumnya terbit.', to_char(earliest, 'DD-MM-YYYY') using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke execute on function public.check_reaudit_window() from public, anon, authenticated;

create trigger audit_tasks_reaudit_window before insert or update of window_start on public.audit_tasks
  for each row execute function public.check_reaudit_window();

-- Client memesan audit ulang untuk semua outlet proyek yang laporannya sudah terbit. Outlet, tujuan, dan kuesioner
-- disalin; kunjungan 1 kali per outlet; tanpa kompetitor dan add-on lain.
create or replace function public.client_order_reaudit(p_parent uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  parent public.projects;
  a public.addons;
  qty integer;
  unit integer;
  needs_review boolean;
  v_project uuid;
  v_invoice uuid;
  snap jsonb;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'client' and status = 'active') then
    raise exception 'Hanya pemilik bisnis yang bisa memesan audit ulang.' using errcode = '42501';
  end if;
  select * into parent from public.projects where id = p_parent and client_id = auth.uid() for update;
  if not found or parent.status <> 'completed' or not exists (select 1 from public.reports where project_id = p_parent and status = 'published') then
    raise exception 'Audit ulang bisa dipesan setelah laporan terbit.' using errcode = '22023';
  end if;
  select * into a from public.addons where key = 're_audit' and active;
  if not found then
    raise exception 'Audit ulang sedang tidak tersedia.' using errcode = '22023';
  end if;
  if cardinality(a.applicable_packages) > 0 and not ((parent.package_snapshot ->> 'key') = any(a.applicable_packages)) then
    raise exception 'Audit ulang tidak tersedia untuk paket %.', parent.package_snapshot ->> 'name' using errcode = '22023';
  end if;
  if exists (select 1 from public.projects where parent_project_id = p_parent and status not in ('cancelled', 'expired')) then
    raise exception 'Audit ulang untuk proyek ini sudah dipesan.' using errcode = '22023';
  end if;
  perform public.expire_overdue();
  if exists (select 1 from public.projects where client_id = auth.uid() and status in ('awaiting_review', 'awaiting_payment', 'verifying')) then
    raise exception 'Masih ada pesanan yang belum selesai. Selesaikan atau tunggu pesanan itu dulu.' using errcode = '22023';
  end if;

  select count(*) into qty from public.project_outlets where project_id = p_parent and not is_competitor;
  unit := public.promo_price(a.price, a.promo_pct, a.promo_starts_at, a.promo_ends_at);
  needs_review := a.requires_review or a.pricing = 'quote';

  insert into public.projects (code, client_id, package_id, package_snapshot, addons_snapshot, outlet_count, entitlements, status, review_reasons,
                               objectives, details_completed_at, parent_project_id, custom_brief)
  values (
    public.next_code('PRJ'), auth.uid(), parent.package_id,
    parent.package_snapshot || jsonb_build_object('name', (parent.package_snapshot ->> 'name') || ' · Audit ulang', 'visits', 1),
    jsonb_build_array(jsonb_build_object('kind', 'addon', 'item_key', a.key, 'label', a.name, 'quantity', qty,
      'unit_price', case when a.pricing = 'quote' then null else unit end, 'amount', case when a.pricing = 'quote' then null else unit * qty end,
      'list_price', a.price, 'estimate', null)),
    qty,
    array(select e from unnest(parent.entitlements) e where e not in ('competitor', 'additional_visit', 'priority', 'consultation', 'consultation_extra')) || array['re_audit'],
    (case when needs_review then 'awaiting_review' else 'awaiting_payment' end)::public.project_status,
    case when needs_review then array['addon'] else '{}'::text[] end,
    parent.objectives, now(), p_parent, parent.custom_brief
  )
  returning id into v_project;

  insert into public.project_outlets (project_id, position, city, name, address, maps_url, notes)
  select v_project, row_number() over (order by position), city, name, address, maps_url, notes
  from public.project_outlets where project_id = p_parent and not is_competitor;

  select snapshot into snap from public.project_questionnaires where project_id = p_parent;
  if snap is not null then
    insert into public.project_questionnaires (project_id, questionnaire_id, snapshot, assigned_by)
    select v_project, questionnaire_id, snapshot, null from public.project_questionnaires where project_id = p_parent;
  end if;

  insert into public.invoices (code, project_id, client_id, status, total, due_at)
  values (public.next_code('INV'), v_project, auth.uid(),
          (case when needs_review then 'draft' else 'unpaid' end)::public.invoice_status,
          case when a.pricing = 'quote' then 0 else unit * qty end,
          case when needs_review then null else now() + interval '48 hours' end)
  returning id into v_invoice;
  insert into public.invoice_lines (invoice_id, position, kind, item_key, label, quantity, unit_price, amount, list_price)
  values (v_invoice, 1, 'addon', a.key, a.name || ' (' || qty || ' outlet, ' || parent.code || ')', qty,
          case when a.pricing = 'quote' then null else unit end, case when a.pricing = 'quote' then null else unit * qty end,
          case when a.pricing = 'quote' then null else a.price end);

  perform public.log_activity('order.reaudit_created', 'project', v_project::text, jsonb_build_object('parent', p_parent, 'outlets', qty));
  return v_project;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Angka laporan
-- ---------------------------------------------------------------------------

-- Nilai satu jawaban 0..1 (Ya = 1, Tidak = 0, skala 1–5 = 0..1). Null untuk teks, kosong, atau tidak teramati.
create or replace function public.answer_value(p_kind text, p_answer jsonb)
returns numeric
language sql immutable as $$
  select case
    when p_answer is null or coalesce((p_answer ->> 'na')::boolean, false) or p_kind = 'text' then null
    when p_kind = 'yes_no' then case p_answer ->> 'value' when 'yes' then 1 when 'no' then 0 end
    when (p_answer ->> 'value') ~ '^[1-5]$' then ((p_answer ->> 'value')::numeric - 1) / 4
  end;
$$;

-- Angka laporan (Fase 4) ditambah target bagian, kepatuhan SOP, customer journey, red flag,
-- SOP dan red flag per outlet, dan audit sebelumnya untuk audit ulang.
create or replace function public.project_report_data(p_project uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  proj public.projects;
  snap jsonb;
  result jsonb;
  prev jsonb;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa menyusun laporan.' using errcode = '42501';
  end if;
  select * into proj from public.projects where id = p_project;
  select snapshot into snap from public.project_questionnaires where project_id = p_project;

  with secs as (
    select s ->> 'id' as id, s ->> 'title' as title, coalesce((s ->> 'weight')::integer, 0) as weight, coalesce((s ->> 'target')::integer, 85) as target, ord
    from jsonb_array_elements(coalesce(snap -> 'sections', '[]'::jsonb)) with ordinality as x(s, ord)
  ),
  qs as (
    select q ->> 'id' as id, q ->> 'prompt' as prompt, q ->> 'kind' as kind, s ->> 'title' as section,
           coalesce((q ->> 'sop')::boolean, false) as sop, coalesce((q ->> 'red_flag')::boolean, false) as red_flag,
           q ->> 'stage' as stage, coalesce((q ->> 'stage_pos')::integer, 999) as stage_pos, sord, qord
    from jsonb_array_elements(coalesce(snap -> 'sections', '[]'::jsonb)) with ordinality as x(s, sord),
         jsonb_array_elements(coalesce(s -> 'questions', '[]'::jsonb)) with ordinality as y(q, qord)
    where q ->> 'kind' <> 'text'
  ),
  visits as (
    select t.id, t.outlet_id, t.score, t.section_scores, t.checkin_at, t.answers from public.audit_tasks t where t.project_id = p_project and t.status = 'approved'
  ),
  outlet_sec as (
    select v.outlet_id, secs.id, avg((v.section_scores ->> secs.id)::numeric) as score
    from visits v cross join secs group by v.outlet_id, secs.id
  ),
  -- Jawaban yang dinilai, hanya kunjungan ke outlet client.
  vals as (
    select v.outlet_id, o.name as outlet, qs.*, public.answer_value(qs.kind, v.answers -> qs.id) as val
    from visits v join public.project_outlets o on o.id = v.outlet_id and not o.is_competitor cross join qs
  ),
  scored as (select * from vals where val is not null),
  outlet_rows as (
    select o.id, o.name, o.city, o.position, o.is_competitor,
           (select avg(v.score) from visits v where v.outlet_id = o.id) as score,
           (select count(*) from visits v where v.outlet_id = o.id) as visits,
           coalesce((select jsonb_agg(jsonb_build_object('title', secs.title, 'score', round(os.score, 1)) order by secs.ord)
                     from secs left join outlet_sec os on os.outlet_id = o.id and os.id = secs.id), '[]'::jsonb) as sections,
           (select round(avg(val) * 100, 1) from scored x where x.outlet_id = o.id and x.sop) as sop,
           (select count(*) from scored x where x.outlet_id = o.id and x.red_flag and x.val <= 0.25) as red_flags
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
    'sections', coalesce((select jsonb_agg(jsonb_build_object('title', secs.title, 'weight', secs.weight, 'target', secs.target,
                 'score', (select round(avg(os.score), 1) from outlet_sec os join outlet_rows o on o.id = os.outlet_id where os.id = secs.id and not o.is_competitor)) order by secs.ord)
                 from secs where secs.weight > 0), '[]'::jsonb),
    'outlets', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'city', city, 'score', round(score, 1), 'visits', visits, 'sections', sections,
                 'sop', sop, 'redFlags', red_flags) order by position)
                from outlet_rows where not is_competitor), '[]'::jsonb),
    'competitors', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'city', city, 'score', round(score, 1), 'sections', sections) order by position)
                from outlet_rows where is_competitor), '[]'::jsonb),
    'sop', jsonb_build_object(
      'score', (select round(avg(val) * 100, 1) from scored where sop),
      'yes', (select count(*) from scored where sop and val = 1),
      'no', (select count(*) from scored where sop and val = 0),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object('prompt', prompt, 'section', section, 'yes', yes, 'no', no, 'outlets', to_jsonb(outlets)) order by no desc, sord, qord)
        from (
          select prompt, section, sord, qord,
                 count(*) filter (where val = 1) as yes, count(*) filter (where val = 0) as no,
                 coalesce(array_agg(distinct outlet) filter (where val = 0), '{}') as outlets
          from scored where sop group by id, prompt, section, sord, qord
        ) i
      ), '[]'::jsonb)
    ),
    'journey', coalesce((
      select jsonb_agg(jsonb_build_object('title', stage, 'score', score, 'questions', questions) order by stage_pos, stage)
      from (select stage, min(stage_pos) as stage_pos, round(avg(val) * 100, 1) as score, count(distinct id) as questions
            from scored where stage is not null group by stage) j
    ), '[]'::jsonb),
    'redFlags', coalesce((
      select jsonb_agg(jsonb_build_object('prompt', prompt, 'section', section, 'outlet', outlet, 'count', n) order by outlet, sord, qord)
      from (select prompt, section, outlet, sord, qord, count(*) as n from scored where red_flag and val <= 0.25 group by id, prompt, section, outlet, sord, qord) r
    ), '[]'::jsonb)
  ) into result;

  -- Audit ulang: angka laporan sebelumnya yang sudah dibekukan.
  if proj.parent_project_id is not null then
    select jsonb_build_object('code', pp.code, 'publishedAt', r.published_at, 'score', r.data -> 'score', 'sections', r.data -> 'sections',
                              'outlets', r.data -> 'outlets', 'sop', r.data -> 'sop' -> 'score')
    into prev
    from public.reports r join public.projects pp on pp.id = r.project_id
    where r.project_id = proj.parent_project_id and r.status = 'published';
    result := result || jsonb_build_object('previous', prev);
  end if;
  return result;
end;
$$;

-- Penghalang terbit (Fase 4), ditambah: semua kunjungan yang direncanakan (termasuk kunjungan tambahan) lolos QC,
-- dan isi kuesioner sesuai fitur paket.
create or replace function public.report_blockers(p_project uuid)
returns text[]
language plpgsql stable security definer set search_path = public as $$
declare
  blockers text[] := '{}';
  rep public.reports;
  proj public.projects;
  snap jsonb;
  o record;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa menyusun laporan.' using errcode = '42501';
  end if;
  select * into proj from public.projects where id = p_project;
  for o in select x.name, x.is_competitor, public.outlet_visits_planned(x.id) as planned,
                  (select count(*) from public.audit_tasks t where t.outlet_id = x.id and t.status = 'approved') as approved
           from public.project_outlets x where x.project_id = p_project order by position loop
    if o.approved < o.planned then
      blockers := blockers || format('%s "%s": %s dari %s kunjungan lolos QC.', case when o.is_competitor then 'Kompetitor' else 'Outlet' end,
                                     coalesce(nullif(o.name, ''), '—'), o.approved, o.planned);
    end if;
  end loop;
  if exists (select 1 from public.audit_tasks where project_id = p_project and status in ('submitted', 'revision')) then
    blockers := blockers || 'Masih ada kunjungan yang menunggu QC atau revisi.'::text;
  end if;
  select snapshot into snap from public.project_questionnaires where project_id = p_project;
  -- Salinan dari sebelum Putaran 9 (tanpa target bagian) belum punya tanda SOP dan journey; dilewati.
  if snap is not null and snap -> 'sections' -> 0 ? 'target' then
    blockers := blockers || public.snapshot_feature_issues(snap, proj.entitlements);
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

-- ---------------------------------------------------------------------------
-- 6. Teks paket
-- ---------------------------------------------------------------------------

-- Review manajemen dilakukan lewat sesi konsultasi; tren diganti pola antar outlet (satu siklus audit).
update public.packages
set features = array_replace(array_remove(features, 'Review manajemen'), 'Analisis tren antar outlet', 'Pola antar outlet')
where key = 'performance';

-- ---------------------------------------------------------------------------
-- Hak akses
-- ---------------------------------------------------------------------------

revoke execute on function public.snapshot_feature_issues(jsonb, text[]) from public, anon;
grant execute on function public.snapshot_feature_issues(jsonb, text[]) to authenticated;
revoke execute on function public.extra_visit_allowance(uuid) from public, anon;
grant execute on function public.extra_visit_allowance(uuid) to authenticated;
revoke execute on function public.outlet_visits_planned(uuid) from public, anon;
grant execute on function public.outlet_visits_planned(uuid) to authenticated;
revoke execute on function public.client_save_extra_visits(uuid, jsonb) from public, anon;
grant execute on function public.client_save_extra_visits(uuid, jsonb) to authenticated;
revoke execute on function public.client_save_brief(uuid, text) from public, anon;
grant execute on function public.client_save_brief(uuid, text) to authenticated;
revoke execute on function public.project_report_eta(uuid) from public, anon;
grant execute on function public.project_report_eta(uuid) to authenticated;
revoke execute on function public.reaudit_earliest_visit(uuid) from public, anon;
grant execute on function public.reaudit_earliest_visit(uuid) to authenticated;
revoke execute on function public.client_order_reaudit(uuid) from public, anon;
grant execute on function public.client_order_reaudit(uuid) to authenticated;
revoke execute on function public.add_working_days(timestamptz, integer) from public, anon;
grant execute on function public.add_working_days(timestamptz, integer) to authenticated;
