-- Fase 3: kuesioner, penjadwalan tugas, dan kunjungan.
--
-- Alur: admin menyusun template kuesioner (bagian berbobot, total 100) → menetapkannya ke proyek (disalin
-- dan dikunci) → membuat tugas per outlet → menawarkannya ke satu shopper dengan batas respons →
-- shopper menerima → check-in di outlet (titik GPS + 1 foto di dalam outlet) → mengisi kuesioner
-- (draft tersimpan) → mengunggah struk dan foto wajib → submit sekali → menunggu QC (Fase 4).
--
-- Kerahasiaan dijaga di level data: tabel tugas hanya bisa dibaca admin. Shopper dan client membaca
-- lewat fungsi yang hanya mengembalikan bagian yang boleh mereka lihat. Client tidak melihat nama
-- shopper, tanggal kunjungan, atau jawaban; shopper hanya melihat nama dan alamat outlet tugasnya.
-- Skor dihitung di database dari jawaban dan bobot, tidak dikirim dari HP.

create type public.task_status as enum ('open', 'offered', 'accepted', 'in_progress', 'submitted', 'cancelled');
create type public.offer_status as enum ('offered', 'accepted', 'declined', 'expired', 'withdrawn');

-- ---------------------------------------------------------------------------
-- Template kuesioner (dikelola admin)
-- ---------------------------------------------------------------------------

create table public.questionnaires (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  -- Jenis bisnis, nilainya sama dengan daftar industri di lamaran shopper.
  business_type text not null default 'other'
    check (business_type in ('fnb', 'retail', 'hospitality', 'banking', 'automotive', 'health', 'beauty', 'telco', 'other')),
  description text not null default '' check (char_length(description) <= 500),
  -- Total foto per kunjungan, termasuk 1 foto check-in dan struk.
  photo_limit integer not null default 5 check (photo_limit between 3 and 20),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger questionnaires_touch before update on public.questionnaires
  for each row execute function public.touch_updated_at();

create table public.questionnaire_sections (
  id uuid primary key default gen_random_uuid(),
  questionnaire_id uuid not null references public.questionnaires (id) on delete cascade,
  position integer not null default 1,
  title text not null check (char_length(btrim(title)) between 2 and 120),
  -- Bobot bagian; semua bagian dalam satu kuesioner berjumlah 100. Bagian berbobot 0 tidak dinilai.
  weight integer not null default 0 check (weight between 0 and 100)
);

create index questionnaire_sections_idx on public.questionnaire_sections (questionnaire_id, position);

create table public.questionnaire_questions (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.questionnaire_sections (id) on delete cascade,
  position integer not null default 1,
  prompt text not null check (char_length(btrim(prompt)) between 3 and 500),
  help text not null default '' check (char_length(help) <= 500),
  -- yes_no dan scale (1–5) dinilai; text tidak dinilai.
  kind text not null default 'yes_no' check (kind in ('yes_no', 'scale', 'text')),
  photo_required boolean not null default false
);

create index questionnaire_questions_idx on public.questionnaire_questions (section_id, position);

-- Masalah yang membuat kuesioner belum bisa dipakai. Kosong = siap ditetapkan ke proyek.
create or replace function public.questionnaire_issues(p_questionnaire uuid)
returns text[]
language plpgsql stable security definer set search_path = public as $$
declare
  qn public.questionnaires;
  issues text[] := '{}';
  total integer;
  photos integer;
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
  -- 1 foto check-in dan minimal 1 struk sudah memakai jatah.
  if photos > qn.photo_limit - 2 then
    issues := issues || format('Pertanyaan wajib foto %s, maksimal %s untuk batas %s foto (1 check-in dan 1 struk sudah termasuk).',
      photos, qn.photo_limit - 2, qn.photo_limit);
  end if;
  return issues;
end;
$$;

-- Salinan kuesioner yang dikunci di proyek.
create or replace function public.questionnaire_snapshot(p_questionnaire uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', qn.id, 'name', qn.name, 'business_type', qn.business_type, 'photo_limit', qn.photo_limit,
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sec.id, 'title', sec.title, 'weight', sec.weight,
        'questions', coalesce((
          select jsonb_agg(jsonb_build_object('id', q.id, 'prompt', q.prompt, 'help', q.help, 'kind', q.kind, 'photo_required', q.photo_required)
                           order by q.position, q.prompt)
          from public.questionnaire_questions q where q.section_id = sec.id
        ), '[]'::jsonb)
      ) order by sec.position, sec.title)
      from public.questionnaire_sections sec where sec.questionnaire_id = qn.id
    ), '[]'::jsonb)
  )
  from public.questionnaires qn where qn.id = p_questionnaire;
$$;

create table public.project_questionnaires (
  project_id uuid primary key references public.projects (id) on delete cascade,
  questionnaire_id uuid references public.questionnaires (id) on delete set null,
  snapshot jsonb not null,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles (id) on delete set null
);

-- Pengaturan lapangan: fee bawaan per kunjungan, batas tugas aktif per shopper, batas respons bawaan (jam).
insert into public.app_settings (key, value) values
  ('field', jsonb_build_object('default_fee', 150000, 'max_active_tasks', 3, 'default_response_hours', 24))
on conflict (key) do nothing;

create or replace function public.field_setting(p_key text, p_default integer)
returns integer
language sql stable security definer set search_path = public as $$
  select coalesce((select (value ->> p_key)::integer from public.app_settings where key = 'field'), p_default);
$$;

-- ---------------------------------------------------------------------------
-- Tugas, tawaran, dan foto kunjungan
-- ---------------------------------------------------------------------------

create table public.audit_tasks (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  project_id uuid not null references public.projects (id) on delete cascade,
  outlet_id uuid not null references public.project_outlets (id) on delete cascade,
  status public.task_status not null default 'open',
  -- Jendela kunjungan dalam WIB. Jam opsional (misalnya jam ramai).
  window_start date not null,
  window_end date not null,
  hours_start time,
  hours_end time,
  fee integer not null check (fee >= 0),
  reimburse_cap integer not null check (reimburse_cap >= 0),
  scenario text not null default '' check (char_length(scenario) <= 2000),
  mandatory_purchase text not null default '' check (char_length(mandatory_purchase) <= 500),
  -- Shopper yang sedang ditawari atau memegang tugas.
  shopper_id uuid references public.profiles (id) on delete set null,
  checkin_at timestamptz,
  checkin_lat double precision check (checkin_lat between -90 and 90),
  checkin_lng double precision check (checkin_lng between -180 and 180),
  checkin_accuracy real check (checkin_accuracy >= 0),
  -- Hasil pencocokan admin antara titik check-in dan lokasi outlet.
  location_check text check (location_check in ('match', 'mismatch')),
  location_note text check (location_note is null or char_length(location_note) <= 500),
  location_checked_at timestamptz,
  location_checked_by uuid references public.profiles (id) on delete set null,
  -- { "<id pertanyaan>": { "value": "yes" | "no" | 1..5 | "teks", "na": true|false, "note": "..." } }
  answers jsonb not null default '{}'::jsonb,
  purchase_amount integer check (purchase_amount between 0 and 100000000),
  purchase_note text not null default '' check (char_length(purchase_note) <= 500),
  -- Selisih pembelian di atas batas reimburse; diputuskan admin saat QC (Fase 4).
  excess_amount integer not null default 0 check (excess_amount >= 0),
  score numeric(5, 2),
  section_scores jsonb,
  submitted_at timestamptz,
  cancel_note text check (cancel_note is null or char_length(cancel_note) <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (window_end >= window_start),
  check ((hours_start is null) = (hours_end is null)),
  check (hours_start is null or hours_end > hours_start)
);

create index audit_tasks_project_idx on public.audit_tasks (project_id, created_at);
create index audit_tasks_status_idx on public.audit_tasks (status);
create index audit_tasks_shopper_idx on public.audit_tasks (shopper_id, status);

create trigger audit_tasks_touch before update on public.audit_tasks
  for each row execute function public.touch_updated_at();

create table public.task_offers (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.audit_tasks (id) on delete cascade,
  shopper_id uuid not null references public.profiles (id) on delete cascade,
  status public.offer_status not null default 'offered',
  urgent boolean not null default false,
  respond_by timestamptz not null,
  responded_at timestamptz,
  decline_reason text check (decline_reason is null or char_length(decline_reason) <= 500),
  followups integer not null default 0,
  last_followup_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index task_offers_open_idx on public.task_offers (task_id) where status = 'offered';
create index task_offers_shopper_idx on public.task_offers (shopper_id, status);

create table public.visit_photos (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.audit_tasks (id) on delete cascade,
  kind text not null check (kind in ('checkin', 'receipt', 'evidence')),
  -- Untuk foto bukti: id pertanyaan di salinan kuesioner.
  question_id text,
  path text not null,
  created_at timestamptz not null default now(),
  check ((kind = 'evidence') = (question_id is not null))
);

create unique index visit_photos_checkin_idx on public.visit_photos (task_id) where kind = 'checkin';
create unique index visit_photos_evidence_idx on public.visit_photos (task_id, question_id) where kind = 'evidence';

-- ---------------------------------------------------------------------------
-- Fungsi bantu
-- ---------------------------------------------------------------------------

-- Tawaran yang lewat batas respons menjadi kedaluwarsa, dan tugasnya kembali terbuka. Aman dipanggil kapan saja.
create or replace function public.expire_offers() returns integer
language plpgsql security definer set search_path = public as $$
declare
  n integer;
  r record;
begin
  n := 0;
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
  return n;
end;
$$;

-- Pertanyaan di salinan kuesioner, berdasarkan id.
create or replace function public.snapshot_question(p_snapshot jsonb, p_question text)
returns jsonb
language sql immutable as $$
  select q from jsonb_array_elements(coalesce(p_snapshot -> 'sections', '[]'::jsonb)) s,
                jsonb_array_elements(coalesce(s -> 'questions', '[]'::jsonb)) q
  where q ->> 'id' = p_question
  limit 1;
$$;

-- Skor kunjungan 0–100. Ya = 1, Tidak = 0, skala 1–5 = 0..1. Isian teks dan "Tidak teramati" tidak dihitung.
-- Skor bagian = rata-rata pertanyaannya. Skor total = rata-rata berbobot bagian yang punya jawaban,
-- jadi bagian yang seluruhnya tidak teramati tidak menurunkan skor.
create or replace function public.visit_score(p_snapshot jsonb, p_answers jsonb)
returns jsonb
language plpgsql immutable as $$
declare
  sec jsonb;
  q jsonb;
  a jsonb;
  v numeric;
  sec_sum numeric;
  sec_n integer;
  weight numeric;
  total_w numeric := 0;
  acc numeric := 0;
  sections jsonb := '{}'::jsonb;
begin
  for sec in select * from jsonb_array_elements(coalesce(p_snapshot -> 'sections', '[]'::jsonb)) loop
    sec_sum := 0;
    sec_n := 0;
    for q in select * from jsonb_array_elements(coalesce(sec -> 'questions', '[]'::jsonb)) loop
      continue when q ->> 'kind' = 'text';
      a := p_answers -> (q ->> 'id');
      continue when a is null or coalesce((a ->> 'na')::boolean, false);
      v := case
        when q ->> 'kind' = 'yes_no' then case a ->> 'value' when 'yes' then 1 when 'no' then 0 end
        when (a ->> 'value') ~ '^[1-5]$' then ((a ->> 'value')::numeric - 1) / 4
      end;
      continue when v is null;
      sec_sum := sec_sum + v;
      sec_n := sec_n + 1;
    end loop;
    if sec_n > 0 then
      sections := sections || jsonb_build_object(sec ->> 'id', round(sec_sum / sec_n * 100, 2));
      weight := coalesce((sec ->> 'weight')::numeric, 0);
      if weight > 0 then
        total_w := total_w + weight;
        acc := acc + weight * sec_sum / sec_n;
      end if;
    end if;
  end loop;
  return jsonb_build_object('score', case when total_w > 0 then round(acc / total_w * 100, 2) end, 'sections', sections);
end;
$$;

-- ---------------------------------------------------------------------------
-- Fungsi admin
-- ---------------------------------------------------------------------------

-- Menetapkan kuesioner ke proyek aktif. Bisa diganti selama belum ada kunjungan yang dimulai.
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
  if exists (select 1 from public.audit_tasks where project_id = p_project and status in ('in_progress', 'submitted')) then
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

-- Membuat tugas kunjungan untuk satu outlet. Fee dan batas reimburse kosong = nilai bawaan.
create or replace function public.admin_create_task(
  p_outlet uuid, p_window_start date, p_window_end date, p_hours_start time default null, p_hours_end time default null,
  p_fee integer default null, p_reimburse integer default null, p_scenario text default '', p_purchase text default '')
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  outlet public.project_outlets;
  proj public.projects;
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa membuat tugas.' using errcode = '42501';
  end if;
  select * into outlet from public.project_outlets where id = p_outlet;
  if not found then
    raise exception 'Outlet tidak ditemukan.' using errcode = 'P0002';
  end if;
  select * into proj from public.projects where id = outlet.project_id;
  if proj.status <> 'active' then
    raise exception 'Tugas hanya bisa dibuat untuk proyek yang aktif.' using errcode = '22023';
  end if;
  if proj.details_completed_at is null then
    raise exception 'Client belum menandai data outlet lengkap.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.project_questionnaires where project_id = proj.id) then
    raise exception 'Tetapkan kuesioner proyek dulu.' using errcode = '22023';
  end if;
  if p_window_start is null or p_window_end is null or p_window_end < p_window_start then
    raise exception 'Isi jendela kunjungan dengan benar.' using errcode = '22023';
  end if;
  if p_window_end < (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Jendela kunjungan sudah lewat.' using errcode = '22023';
  end if;
  if (p_hours_start is null) <> (p_hours_end is null) or (p_hours_start is not null and p_hours_end <= p_hours_start) then
    raise exception 'Jam kunjungan harus diisi keduanya, dengan jam selesai setelah jam mulai.' using errcode = '22023';
  end if;

  insert into public.audit_tasks (code, project_id, outlet_id, window_start, window_end, hours_start, hours_end,
                                  fee, reimburse_cap, scenario, mandatory_purchase, created_by)
  values (public.next_code('TGS'), proj.id, outlet.id, p_window_start, p_window_end, p_hours_start, p_hours_end,
          coalesce(p_fee, public.field_setting('default_fee', 150000)),
          coalesce(p_reimburse, (proj.package_snapshot ->> 'purchase_allowance')::integer, 150000),
          btrim(coalesce(p_scenario, '')), btrim(coalesce(p_purchase, '')), auth.uid())
  returning id into v_id;
  perform public.log_activity('task.created', 'task', v_id::text, jsonb_build_object('project', proj.id, 'outlet', outlet.id));
  return v_id;
end;
$$;

-- Mengubah brief tugas yang belum ditawarkan ke siapa pun.
create or replace function public.admin_update_task(
  p_task uuid, p_window_start date, p_window_end date, p_hours_start time, p_hours_end time,
  p_fee integer, p_reimburse integer, p_scenario text, p_purchase text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  task public.audit_tasks;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa mengubah tugas.' using errcode = '42501';
  end if;
  select * into task from public.audit_tasks where id = p_task for update;
  if not found then
    raise exception 'Tugas tidak ditemukan.' using errcode = 'P0002';
  end if;
  if task.status <> 'open' then
    raise exception 'Tugas hanya bisa diubah selama belum ditawarkan. Tarik tawarannya dulu.' using errcode = '22023';
  end if;
  if p_window_start is null or p_window_end is null or p_window_end < p_window_start then
    raise exception 'Isi jendela kunjungan dengan benar.' using errcode = '22023';
  end if;
  if (p_hours_start is null) <> (p_hours_end is null) or (p_hours_start is not null and p_hours_end <= p_hours_start) then
    raise exception 'Jam kunjungan harus diisi keduanya, dengan jam selesai setelah jam mulai.' using errcode = '22023';
  end if;
  if p_fee is null or p_fee < 0 or p_reimburse is null or p_reimburse < 0 then
    raise exception 'Isi fee dan batas reimburse.' using errcode = '22023';
  end if;
  update public.audit_tasks set
    window_start = p_window_start, window_end = p_window_end, hours_start = p_hours_start, hours_end = p_hours_end,
    fee = p_fee, reimburse_cap = p_reimburse, scenario = btrim(coalesce(p_scenario, '')), mandatory_purchase = btrim(coalesce(p_purchase, ''))
  where id = p_task;
  perform public.log_activity('task.updated', 'task', p_task::text, '{}'::jsonb);
end;
$$;

-- Calon shopper untuk satu tugas: shopper aktif, urut dari yang menjangkau kota outlet dan paling sedikit tugasnya.
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
           (select count(*)::integer from public.audit_tasks t where t.shopper_id = p.id and t.status in ('offered', 'accepted', 'in_progress')) as active,
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

-- Menawarkan tugas ke satu shopper dengan batas respons (jam). Shopper mendapat notifikasi.
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
  select count(*) into active from public.audit_tasks where shopper_id = p_shopper and status in ('offered', 'accepted', 'in_progress');
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

-- Menarik tawaran yang belum dijawab; tugas kembali terbuka.
create or replace function public.admin_withdraw_offer(p_task uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  task public.audit_tasks;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa menarik tawaran.' using errcode = '42501';
  end if;
  select * into task from public.audit_tasks where id = p_task for update;
  if not found or task.status <> 'offered' then
    raise exception 'Tugas ini tidak sedang ditawarkan.' using errcode = '22023';
  end if;
  update public.task_offers set status = 'withdrawn', responded_at = now() where task_id = task.id and status = 'offered';
  update public.audit_tasks set status = 'open', shopper_id = null where id = task.id;
  perform public.notify(task.shopper_id, 'task.withdrawn', jsonb_build_object('task', task.id, 'code', task.code));
  perform public.log_activity('task.offer_withdrawn', 'task', task.id::text, jsonb_build_object('shopper', task.shopper_id));
end;
$$;

-- Mencatat follow up WhatsApp ke shopper yang ditawari. Mengembalikan nomor WhatsApp shopper.
create or replace function public.admin_record_followup(p_task uuid)
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
  if not found or task.status <> 'offered' then
    raise exception 'Tugas ini tidak sedang menunggu jawaban shopper.' using errcode = '22023';
  end if;
  select phone into v_phone from public.profiles where id = task.shopper_id;
  if v_phone is null then
    raise exception 'Shopper ini belum mengisi nomor WhatsApp.' using errcode = '22023';
  end if;
  update public.task_offers set followups = followups + 1, last_followup_at = now() where task_id = task.id and status = 'offered';
  perform public.log_activity('task.followed_up', 'task', task.id::text, jsonb_build_object('shopper', task.shopper_id));
  return v_phone;
end;
$$;

-- Membatalkan tugas yang belum disubmit, dengan alasan. Shopper yang memegangnya diberi tahu.
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
  if task.status in ('submitted', 'cancelled') then
    raise exception 'Tugas yang sudah disubmit atau dibatalkan tidak bisa dibatalkan.' using errcode = '22023';
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

-- Hasil pencocokan titik check-in dengan lokasi outlet.
create or replace function public.admin_check_location(p_task uuid, p_match boolean, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  task public.audit_tasks;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa mencocokkan lokasi.' using errcode = '42501';
  end if;
  select * into task from public.audit_tasks where id = p_task for update;
  if not found or task.checkin_at is null then
    raise exception 'Tugas ini belum check-in.' using errcode = '22023';
  end if;
  update public.audit_tasks set
    location_check = case when p_match then 'match' else 'mismatch' end,
    location_note = left(nullif(btrim(coalesce(p_note, '')), ''), 500),
    location_checked_at = now(), location_checked_by = auth.uid()
  where id = task.id;
  perform public.log_activity('task.location_checked', 'task', task.id::text, jsonb_build_object('match', p_match, 'note', p_note));
end;
$$;

-- ---------------------------------------------------------------------------
-- Fungsi shopper
-- ---------------------------------------------------------------------------

-- Tugas milik shopper yang sedang masuk (dikunci baris), atau error.
create or replace function public.my_task(p_task uuid, p_statuses public.task_status[])
returns public.audit_tasks
language plpgsql security definer set search_path = public as $$
declare
  task public.audit_tasks;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'shopper' and status = 'active') then
    raise exception 'Hanya shopper aktif yang bisa mengerjakan tugas.' using errcode = '42501';
  end if;
  select * into task from public.audit_tasks where id = p_task and shopper_id = auth.uid() for update;
  if not found then
    raise exception 'Tugas tidak ditemukan.' using errcode = 'P0002';
  end if;
  if not task.status = any (p_statuses) then
    raise exception 'Langkah ini tidak bisa dilakukan pada tugas berstatus %.', task.status using errcode = '22023';
  end if;
  return task;
end;
$$;

-- Menerima atau menolak tawaran sebelum batas respons.
create or replace function public.shopper_respond_offer(p_task uuid, p_accept boolean, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  task public.audit_tasks;
  offer public.task_offers;
begin
  perform public.expire_offers();
  if not exists (select 1 from public.audit_tasks where id = p_task and shopper_id = auth.uid() and status = 'offered') then
    raise exception 'Tawaran ini sudah tidak berlaku.' using errcode = '22023';
  end if;
  task := public.my_task(p_task, array['offered']::public.task_status[]);
  select * into offer from public.task_offers where task_id = task.id and status = 'offered' and shopper_id = auth.uid() for update;

  if p_accept then
    update public.task_offers set status = 'accepted', responded_at = now() where id = offer.id;
    update public.audit_tasks set status = 'accepted' where id = task.id;
    perform public.log_activity('task.accepted', 'task', task.id::text, '{}'::jsonb);
  else
    update public.task_offers set status = 'declined', responded_at = now(),
      decline_reason = left(nullif(btrim(coalesce(p_reason, '')), ''), 500) where id = offer.id;
    update public.audit_tasks set status = 'open', shopper_id = null where id = task.id;
    perform public.log_activity('task.declined', 'task', task.id::text, jsonb_build_object('reason', p_reason));
  end if;
end;
$$;

-- Check-in di outlet: titik GPS, akurasi, dan 1 foto di dalam outlet (sudah diunggah ke folder tugas ini).
create or replace function public.shopper_check_in(p_task uuid, p_lat double precision, p_lng double precision, p_accuracy real, p_photo text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  task public.audit_tasks;
  now_wib timestamp := now() at time zone 'Asia/Jakarta';
begin
  task := public.my_task(p_task, array['accepted']::public.task_status[]);
  if now_wib::date < task.window_start or now_wib::date > task.window_end then
    raise exception 'Check-in hanya bisa dilakukan pada % sampai % (WIB).', to_char(task.window_start, 'DD-MM-YYYY'), to_char(task.window_end, 'DD-MM-YYYY')
      using errcode = '22023';
  end if;
  if task.hours_start is not null and (now_wib::time < task.hours_start or now_wib::time > task.hours_end) then
    raise exception 'Check-in hanya bisa dilakukan pukul % sampai % WIB.', to_char(task.hours_start, 'HH24:MI'), to_char(task.hours_end, 'HH24:MI')
      using errcode = '22023';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Lokasi tidak terbaca. Izinkan akses lokasi lalu coba lagi.' using errcode = '22023';
  end if;
  if p_photo is null or p_photo not like auth.uid()::text || '/' || task.id::text || '/%' then
    raise exception 'Foto check-in tidak valid.' using errcode = '22023';
  end if;

  insert into public.visit_photos (task_id, kind, path) values (task.id, 'checkin', p_photo);
  update public.audit_tasks set status = 'in_progress', checkin_at = now(),
    checkin_lat = p_lat, checkin_lng = p_lng, checkin_accuracy = greatest(coalesce(p_accuracy, 0), 0)
  where id = task.id;
  perform public.log_activity('task.checked_in', 'task', task.id::text,
    jsonb_build_object('lat', p_lat, 'lng', p_lng, 'accuracy', p_accuracy));
end;
$$;

-- Menyimpan draft jawaban dan nominal pembelian. Dipanggil berulang selama kunjungan.
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
begin
  task := public.my_task(p_task, array['in_progress']::public.task_status[]);
  select snapshot into snap from public.project_questionnaires where project_id = task.project_id;
  if jsonb_typeof(coalesce(p_answers, '{}'::jsonb)) <> 'object' then
    raise exception 'Format jawaban tidak valid.' using errcode = '22023';
  end if;

  for k, a in select key, value from jsonb_each(coalesce(p_answers, '{}'::jsonb)) loop
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
  update public.audit_tasks set answers = coalesce(p_answers, '{}'::jsonb), purchase_amount = p_purchase,
    purchase_note = left(btrim(coalesce(p_purchase_note, '')), 500)
  where id = task.id;
end;
$$;

-- Mendaftarkan foto struk atau bukti yang sudah diunggah. Total foto tidak boleh melebihi batas kuesioner.
create or replace function public.shopper_add_photo(p_task uuid, p_kind text, p_question text, p_path text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  task public.audit_tasks;
  snap jsonb;
  used integer;
  v_id uuid;
begin
  task := public.my_task(p_task, array['in_progress']::public.task_status[]);
  select snapshot into snap from public.project_questionnaires where project_id = task.project_id;
  if p_kind not in ('receipt', 'evidence') then
    raise exception 'Jenis foto tidak valid.' using errcode = '22023';
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

-- Menghapus foto struk atau bukti selama kunjungan belum disubmit. Mengembalikan path untuk dihapus dari penyimpanan.
create or replace function public.shopper_remove_photo(p_photo uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  photo public.visit_photos;
begin
  select * into photo from public.visit_photos where id = p_photo;
  if not found then
    raise exception 'Foto tidak ditemukan.' using errcode = 'P0002';
  end if;
  perform public.my_task(photo.task_id, array['in_progress']::public.task_status[]);
  if photo.kind = 'checkin' then
    raise exception 'Foto check-in tidak bisa dihapus.' using errcode = '22023';
  end if;
  delete from public.visit_photos where id = photo.id;
  return photo.path;
end;
$$;

-- Submit sekali: semua pertanyaan terjawab atau ditandai tidak teramati, foto wajib dan struk lengkap.
-- Skor dihitung di sini. Setelah submit, isian terkunci.
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
  task := public.my_task(p_task, array['in_progress']::public.task_status[]);
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
    excess_amount = greatest(task.purchase_amount - task.reimburse_cap, 0)
  where id = task.id;
  perform public.log_activity('task.submitted', 'task', task.id::text,
    jsonb_build_object('score', result -> 'score', 'purchase', task.purchase_amount, 'excess', greatest(task.purchase_amount - task.reimburse_cap, 0)));
  return result;
end;
$$;

-- Daftar tugas shopper: tawaran, tugas berjalan, dan yang sudah disubmit. Tanpa data client selain outlet.
create or replace function public.shopper_tasks()
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.expire_offers();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'code', t.code, 'status', t.status, 'city', o.city, 'outlet_name', o.name, 'address', o.address,
      'window_start', t.window_start, 'window_end', t.window_end, 'hours_start', t.hours_start, 'hours_end', t.hours_end,
      'fee', t.fee, 'respond_by', f.respond_by, 'urgent', coalesce(f.urgent, false), 'submitted_at', t.submitted_at
    ) order by coalesce(f.urgent, false) desc, t.status, t.window_start)
    from public.audit_tasks t
    join public.project_outlets o on o.id = t.outlet_id
    left join public.task_offers f on f.task_id = t.id and f.status = 'offered'
    where t.shopper_id = auth.uid() and t.status in ('offered', 'accepted', 'in_progress', 'submitted')
  ), '[]'::jsonb);
end;
$$;

-- Detail satu tugas untuk shopper. Kuesioner baru terlihat setelah tawaran diterima.
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
  select * into t from public.audit_tasks where id = p_task and shopper_id = auth.uid() and status in ('offered', 'accepted', 'in_progress', 'submitted');
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
    'questionnaire', case when snap is null then null else jsonb_build_object('photo_limit', snap -> 'photo_limit', 'sections', snap -> 'sections') end,
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'kind', p.kind, 'question_id', p.question_id, 'path', p.path) order by p.created_at)
                        from public.visit_photos p where p.task_id = t.id), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Fungsi client
-- ---------------------------------------------------------------------------

-- Progres audit per outlet untuk client. Tanpa nama shopper, tanggal kunjungan, atau jawaban.
-- Kunjungan yang sedang berlangsung tetap tampil "dijadwalkan" supaya outlet tidak bisa diberi tahu saat itu juga.
create or replace function public.client_audit_progress()
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'project_id', p.id, 'project_code', p.code, 'outlet_id', o.id, 'position', o.position, 'name', o.name, 'city', o.city,
    'visits_planned', coalesce((p.package_snapshot ->> 'visits')::integer, 1),
    'scheduled', (select count(*) from public.audit_tasks t where t.outlet_id = o.id and t.status in ('open', 'offered', 'accepted', 'in_progress')),
    'awaiting_qc', (select count(*) from public.audit_tasks t where t.outlet_id = o.id and t.status = 'submitted')
  ) order by p.created_at desc, o.position), '[]'::jsonb)
  from public.projects p
  join public.project_outlets o on o.project_id = p.id
  where p.client_id = auth.uid() and p.status in ('active', 'reporting', 'completed');
$$;

-- ---------------------------------------------------------------------------
-- Kuesioner awal (bisa diubah admin): kafe dan restoran, setara paket Essential.
-- ---------------------------------------------------------------------------

do $$
declare
  qn uuid;
  sec uuid;
  s record;
  q record;
begin
  insert into public.questionnaires (name, business_type, description, photo_limit)
  values ('Kafe & restoran — dasar', 'fnb', 'Template awal untuk kunjungan kafe dan restoran. Ubah sesuai kebutuhan client.', 5)
  returning id into qn;

  for s in select * from (values
    (1, 'Sapaan dan sikap pelayanan', 15),
    (2, 'Pengetahuan produk', 15),
    (3, 'Ketepatan pesanan', 15),
    (4, 'Kecepatan pelayanan', 20),
    (5, 'Kebersihan dan suasana', 20),
    (6, 'Upselling dan closing', 15),
    (7, 'Catatan umum', 0)
  ) as v(pos, title, weight) loop
    insert into public.questionnaire_sections (questionnaire_id, position, title, weight) values (qn, s.pos, s.title, s.weight) returning id into sec;
    for q in select * from (values
      (1, 1, 'Staf menyapa dalam 10 detik setelah Anda masuk.', 'yes_no', false),
      (1, 2, 'Staf tersenyum dan melakukan kontak mata.', 'yes_no', false),
      (1, 3, 'Keramahan staf secara keseluruhan.', 'scale', false),
      (2, 1, 'Staf bisa menjelaskan menu andalan saat ditanya.', 'yes_no', false),
      (2, 2, 'Staf memberi rekomendasi sesuai permintaan Anda.', 'yes_no', false),
      (2, 3, 'Kejelasan penjelasan produk.', 'scale', false),
      (3, 1, 'Staf mengulang pesanan sebelum diproses.', 'yes_no', false),
      (3, 2, 'Pesanan yang diterima sesuai dengan yang dipesan.', 'yes_no', true),
      (3, 3, 'Nominal di struk sesuai harga menu.', 'yes_no', false),
      (4, 1, 'Waktu tunggu sampai pesanan diterima wajar (di bawah 15 menit).', 'yes_no', false),
      (4, 2, 'Antrian di kasir tertangani dengan baik.', 'scale', false),
      (5, 1, 'Meja dan kursi bersih saat Anda duduk.', 'yes_no', true),
      (5, 2, 'Area kasir dan display produk rapi.', 'yes_no', false),
      (5, 3, 'Kenyamanan suasana (suhu, musik, pencahayaan).', 'scale', false),
      (6, 1, 'Staf menawarkan menu tambahan atau ukuran lebih besar.', 'yes_no', false),
      (6, 2, 'Staf mengucapkan terima kasih dan mengajak kembali.', 'yes_no', false),
      (7, 1, 'Ceritakan singkat pengalaman Anda dan hal yang paling menonjol.', 'text', false)
    ) as v(sec_pos, pos, prompt, kind, photo) where v.sec_pos = s.pos loop
      insert into public.questionnaire_questions (section_id, position, prompt, kind, photo_required) values (sec, q.pos, q.prompt, q.kind, q.photo);
    end loop;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Hak akses
-- ---------------------------------------------------------------------------

alter table public.questionnaires enable row level security;
alter table public.questionnaire_sections enable row level security;
alter table public.questionnaire_questions enable row level security;
alter table public.project_questionnaires enable row level security;
alter table public.audit_tasks enable row level security;
alter table public.task_offers enable row level security;
alter table public.visit_photos enable row level security;

-- Template kuesioner: hanya admin.
create policy "admin mengelola kuesioner" on public.questionnaires for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin mengelola bagian kuesioner" on public.questionnaire_sections for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin mengelola pertanyaan" on public.questionnaire_questions for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.questionnaires, public.questionnaire_sections, public.questionnaire_questions from anon;

-- Tugas, tawaran, foto, dan salinan kuesioner: dibaca admin; shopper dan client lewat fungsi.
create policy "admin membaca kuesioner proyek" on public.project_questionnaires for select to authenticated using (public.is_admin());
create policy "admin membaca tugas" on public.audit_tasks for select to authenticated using (public.is_admin());
create policy "admin membaca tawaran" on public.task_offers for select to authenticated using (public.is_admin());
create policy "admin membaca foto kunjungan" on public.visit_photos for select to authenticated using (public.is_admin());
revoke all on public.project_questionnaires, public.audit_tasks, public.task_offers, public.visit_photos from anon;
revoke insert, update, delete on public.project_questionnaires, public.audit_tasks, public.task_offers, public.visit_photos from authenticated;

revoke execute on function public.questionnaire_snapshot(uuid) from public, anon, authenticated;
revoke execute on function public.field_setting(text, integer) from public, anon, authenticated;
revoke execute on function public.snapshot_question(jsonb, text) from public, anon;
revoke execute on function public.visit_score(jsonb, jsonb) from public, anon;
revoke execute on function public.my_task(uuid, public.task_status[]) from public, anon, authenticated;

revoke execute on function public.expire_offers() from public, anon;
grant execute on function public.expire_offers() to authenticated;
revoke execute on function public.questionnaire_issues(uuid) from public, anon;
grant execute on function public.questionnaire_issues(uuid) to authenticated;
revoke execute on function public.admin_assign_questionnaire(uuid, uuid) from public, anon;
grant execute on function public.admin_assign_questionnaire(uuid, uuid) to authenticated;
revoke execute on function public.admin_create_task(uuid, date, date, time, time, integer, integer, text, text) from public, anon;
grant execute on function public.admin_create_task(uuid, date, date, time, time, integer, integer, text, text) to authenticated;
revoke execute on function public.admin_update_task(uuid, date, date, time, time, integer, integer, text, text) from public, anon;
grant execute on function public.admin_update_task(uuid, date, date, time, time, integer, integer, text, text) to authenticated;
revoke execute on function public.admin_task_candidates(uuid) from public, anon;
grant execute on function public.admin_task_candidates(uuid) to authenticated;
revoke execute on function public.admin_offer_task(uuid, uuid, integer, boolean) from public, anon;
grant execute on function public.admin_offer_task(uuid, uuid, integer, boolean) to authenticated;
revoke execute on function public.admin_withdraw_offer(uuid) from public, anon;
grant execute on function public.admin_withdraw_offer(uuid) to authenticated;
revoke execute on function public.admin_record_followup(uuid) from public, anon;
grant execute on function public.admin_record_followup(uuid) to authenticated;
revoke execute on function public.admin_cancel_task(uuid, text) from public, anon;
grant execute on function public.admin_cancel_task(uuid, text) to authenticated;
revoke execute on function public.admin_check_location(uuid, boolean, text) from public, anon;
grant execute on function public.admin_check_location(uuid, boolean, text) to authenticated;
revoke execute on function public.shopper_respond_offer(uuid, boolean, text) from public, anon;
grant execute on function public.shopper_respond_offer(uuid, boolean, text) to authenticated;
revoke execute on function public.shopper_check_in(uuid, double precision, double precision, real, text) from public, anon;
grant execute on function public.shopper_check_in(uuid, double precision, double precision, real, text) to authenticated;
revoke execute on function public.shopper_save_visit(uuid, jsonb, integer, text) from public, anon;
grant execute on function public.shopper_save_visit(uuid, jsonb, integer, text) to authenticated;
revoke execute on function public.shopper_add_photo(uuid, text, text, text) from public, anon;
grant execute on function public.shopper_add_photo(uuid, text, text, text) to authenticated;
revoke execute on function public.shopper_remove_photo(uuid) from public, anon;
grant execute on function public.shopper_remove_photo(uuid) to authenticated;
revoke execute on function public.shopper_submit_visit(uuid) from public, anon;
grant execute on function public.shopper_submit_visit(uuid) to authenticated;
revoke execute on function public.shopper_tasks() from public, anon;
grant execute on function public.shopper_tasks() to authenticated;
revoke execute on function public.shopper_task(uuid) from public, anon;
grant execute on function public.shopper_task(uuid) to authenticated;
revoke execute on function public.client_audit_progress() from public, anon;
grant execute on function public.client_audit_progress() to authenticated;
