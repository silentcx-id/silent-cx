-- Putaran 13: persetujuan kuesioner oleh client dan edit profil shopper/client.
--
-- 1. Persetujuan kuesioner (semua paket). Admin menetapkan kuesioner lalu mengirimnya ke client. Client menyetujui
--    atau mengajukan perbaikan (menandai pertanyaan dengan catatan, mengusulkan pertanyaan tambahan). Tawaran tugas
--    ke shopper baru bisa dikirim setelah disetujui. Tanpa tanggapan, kuesioner otomatis disetujui 3×24 jam setelah
--    dikirim, dengan pengingat setelah 24 jam. Perbaikan paling banyak 2 kali; kiriman berikutnya adalah draft final
--    yang hanya bisa dilihat client dan langsung berlaku.
-- 2. Edit profil. Shopper mengubah semua datanya sendiri (lamaran yang sudah disetujui ikut diperbarui), client
--    mengubah data perusahaan. Setiap perubahan tercatat di profile_changes dan terlihat admin di Detail akun.

-- ---------------------------------------------------------------------------
-- 1. Persetujuan kuesioner
-- ---------------------------------------------------------------------------

-- Kuesioner salinan khusus satu proyek (tombol "Salin untuk proyek ini"), supaya perbaikan untuk satu client tidak
-- mengubah template yang dipakai client lain.
alter table public.questionnaires
  add column project_id uuid references public.projects (id) on delete set null;

create index questionnaires_project_idx on public.questionnaires (project_id) where project_id is not null;

-- Setiap kiriman kuesioner ke client (versi). Isi yang dikirim disimpan apa adanya.
create table public.questionnaire_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  -- Nomor versi yang dilihat client: jumlah perbaikan sebelumnya + 1 (versi 3 = draft final).
  version integer not null check (version between 1 and 3),
  snapshot jsonb not null,
  sent_at timestamptz not null default now(),
  sent_by uuid references public.profiles (id) on delete set null,
  -- Batas tinjauan (3×24 jam); kosong untuk draft final.
  due_at timestamptz,
  reminded_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'approved', 'changes_requested', 'auto_approved', 'final')),
  decided_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null,
  -- Pertanyaan yang ditandai client: [{ question, section, prompt, note }].
  flags jsonb not null default '[]'::jsonb check (jsonb_typeof(flags) = 'array'),
  -- Usulan pertanyaan tambahan dari client.
  additions text not null default '' check (char_length(additions) <= 2000),
  check ((status = 'pending') = (decided_at is null)),
  check (status = 'final' or due_at is not null)
);

create index questionnaire_reviews_project_idx on public.questionnaire_reviews (project_id, sent_at desc);
create index questionnaire_reviews_pending_idx on public.questionnaire_reviews (due_at) where status = 'pending';

-- Kiriman yang berlaku untuk kuesioner proyek saat ini. Kosong = belum dikirim (atau kuesioner diganti setelah dikirim).
alter table public.project_questionnaires
  add column review_id uuid references public.questionnaire_reviews (id) on delete set null;

-- Proyek yang sudah berjalan sebelum fitur ini (sudah ada tawaran tugas) dianggap sudah disetujui, supaya tidak macet.
-- Proyek yang belum menawarkan tugas mengikuti alur baru.
with backfill as (
  insert into public.questionnaire_reviews (project_id, version, snapshot, sent_at, sent_by, due_at, status, decided_at)
  select pq.project_id, 1, pq.snapshot, pq.assigned_at, pq.assigned_by, pq.assigned_at, 'approved', now()
  from public.project_questionnaires pq
  where exists (select 1 from public.audit_tasks t join public.task_offers o on o.task_id = t.id where t.project_id = pq.project_id)
  returning id, project_id
)
update public.project_questionnaires pq set review_id = b.id from backfill b where pq.project_id = b.project_id;

-- Kuesioner proyek sudah disetujui client (sendiri, otomatis, atau draft final).
create or replace function public.questionnaire_approved(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.project_questionnaires pq join public.questionnaire_reviews r on r.id = pq.review_id
    where pq.project_id = p_project and r.status in ('approved', 'auto_approved', 'final')
  );
$$;

-- Jumlah perbaikan yang sudah diajukan client untuk proyek ini (maksimal 2).
create or replace function public.questionnaire_revisions_used(p_project uuid) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.questionnaire_reviews where project_id = p_project and status = 'changes_requested';
$$;

-- Tawaran tugas ke shopper hanya setelah kuesioner disetujui.
create or replace function public.check_offer_questionnaire() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_project uuid;
begin
  select project_id into v_project from public.audit_tasks where id = new.task_id;
  if not public.questionnaire_approved(v_project) then
    raise exception 'Kuesioner proyek belum disetujui client. Tugas bisa ditawarkan setelah client menyetujui atau batas tinjauan 3×24 jam lewat.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke execute on function public.check_offer_questionnaire() from public, anon, authenticated;

create trigger task_offers_questionnaire_approved before insert on public.task_offers
  for each row execute function public.check_offer_questionnaire();

-- Pemeriksaan kuesioner sebelum dipakai proyek: siap, aktif, dan sesuai paket. Mengembalikan salinannya.
create or replace function public.project_questionnaire_snapshot(p_project uuid, p_questionnaire uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  proj public.projects;
  issues text[];
  snap jsonb;
begin
  select * into proj from public.projects where id = p_project;
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
  return snap;
end;
$$;

revoke execute on function public.project_questionnaire_snapshot(uuid, uuid) from public, anon, authenticated;

-- Menetapkan kuesioner (dari 20261030000014). Menetapkan ulang membuat kuesioner perlu dikirim lagi ke client;
-- kiriman yang masih menunggu tanggapan ditarik.
create or replace function public.admin_assign_questionnaire(p_project uuid, p_questionnaire uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  proj public.projects;
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
  if exists (select 1 from public.questionnaires where id = p_questionnaire and project_id is not null and project_id <> p_project) then
    raise exception 'Kuesioner ini salinan khusus proyek lain.' using errcode = '22023';
  end if;
  snap := public.project_questionnaire_snapshot(p_project, p_questionnaire);

  delete from public.questionnaire_reviews r
  using public.project_questionnaires pq
  where pq.project_id = p_project and r.id = pq.review_id and r.status = 'pending';

  insert into public.project_questionnaires (project_id, questionnaire_id, snapshot, assigned_by)
  values (p_project, p_questionnaire, snap, auth.uid())
  on conflict (project_id) do update
    set questionnaire_id = excluded.questionnaire_id, snapshot = excluded.snapshot, assigned_at = now(),
        assigned_by = excluded.assigned_by, review_id = null;
  perform public.log_activity('project.questionnaire_assigned', 'project', p_project::text, jsonb_build_object('questionnaire', p_questionnaire));
end;
$$;

-- Mengirim kuesioner proyek ke client. Isinya diambil ulang dari kuesioner yang ditetapkan, jadi suntingan setelah
-- ditetapkan ikut terkirim. Setelah 2 kali perbaikan, kiriman berikutnya adalah draft final yang langsung berlaku.
create or replace function public.admin_send_questionnaire(p_project uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  proj public.projects;
  pq public.project_questionnaires;
  cur public.questionnaire_reviews;
  snap jsonb;
  used integer;
  is_final boolean;
  v_id uuid;
  v_due timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa mengirim kuesioner.' using errcode = '42501';
  end if;
  select * into proj from public.projects where id = p_project for update;
  if not found then
    raise exception 'Proyek tidak ditemukan.' using errcode = 'P0002';
  end if;
  if proj.status <> 'active' then
    raise exception 'Kuesioner hanya bisa dikirim untuk proyek yang aktif.' using errcode = '22023';
  end if;
  select * into pq from public.project_questionnaires where project_id = p_project for update;
  if not found then
    raise exception 'Tetapkan kuesioner proyek dulu.' using errcode = '22023';
  end if;
  select * into cur from public.questionnaire_reviews where id = pq.review_id;
  if found and cur.status = 'pending' then
    raise exception 'Kuesioner sedang ditinjau client.' using errcode = '22023';
  end if;
  if found and cur.status <> 'changes_requested' then
    raise exception 'Kuesioner proyek ini sudah disetujui.' using errcode = '22023';
  end if;
  if exists (select 1 from public.audit_tasks where project_id = p_project and status in ('in_progress', 'submitted', 'revision', 'approved', 'rejected')) then
    raise exception 'Kuesioner tidak bisa dikirim ulang karena sudah ada kunjungan yang dimulai.' using errcode = '22023';
  end if;

  -- Template yang sudah dihapus: yang dikirim adalah salinan terakhir di proyek.
  snap := case when pq.questionnaire_id is not null and exists (select 1 from public.questionnaires where id = pq.questionnaire_id)
               then public.project_questionnaire_snapshot(p_project, pq.questionnaire_id) else pq.snapshot end;
  used := public.questionnaire_revisions_used(p_project);
  is_final := used >= 2;
  v_due := case when is_final then null else now() + interval '72 hours' end;

  insert into public.questionnaire_reviews (project_id, version, snapshot, sent_by, due_at, status, decided_at)
  values (p_project, least(used + 1, 3), snap, auth.uid(), v_due,
          case when is_final then 'final' else 'pending' end, case when is_final then now() end)
  returning id into v_id;
  update public.project_questionnaires set snapshot = snap, review_id = v_id where project_id = p_project;

  perform public.notify(proj.client_id, case when is_final then 'questionnaire.final' else 'questionnaire.review' end,
    jsonb_build_object('project', p_project, 'code', proj.code, 'due', v_due, 'version', least(used + 1, 3)));
  perform public.log_activity('project.questionnaire_sent', 'project', p_project::text,
    jsonb_build_object('review', v_id, 'version', least(used + 1, 3), 'final', is_final));
  return jsonb_build_object('id', v_id, 'version', least(used + 1, 3), 'final', is_final, 'due', v_due);
end;
$$;

-- Salinan kuesioner proyek untuk diperbaiki khusus client ini, langsung ditetapkan ke proyek.
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

  insert into public.questionnaires (name, business_type, description, photo_limit, active, project_id)
  values (left(src.name || ' · ' || proj.code, 120), src.business_type, src.description, src.photo_limit, true, p_project)
  returning id into v_id;
  for s in select * from public.questionnaire_sections where questionnaire_id = src.id order by position loop
    insert into public.questionnaire_sections (questionnaire_id, position, title, weight, target)
    values (v_id, s.position, s.title, s.weight, s.target)
    returning id into v_section;
    insert into public.questionnaire_questions (section_id, position, prompt, help, kind, photo_required, is_sop, red_flag, journey_stage_id)
    select v_section, q.position, q.prompt, q.help, q.kind, q.photo_required, q.is_sop, q.red_flag, q.journey_stage_id
    from public.questionnaire_questions q where q.section_id = s.id;
  end loop;

  -- Isinya sama dengan yang sudah ditetapkan, jadi status kiriman tidak berubah.
  update public.project_questionnaires set questionnaire_id = v_id where project_id = p_project;
  perform public.log_activity('questionnaire.copied_for_project', 'questionnaire', v_id::text,
    jsonb_build_object('project', p_project, 'source', src.id));
  return v_id;
end;
$$;

-- Pengingat 24 jam dan persetujuan otomatis 3×24 jam. Dijalankan jadwal database setiap 5 menit dan saat halaman
-- terkait dibuka; aman dipanggil berulang.
create or replace function public.questionnaire_review_tick()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select qr.id, qr.project_id, qr.due_at, p.code, p.client_id
    from public.questionnaire_reviews qr join public.projects p on p.id = qr.project_id
    where qr.status = 'pending' and qr.reminded_at is null and qr.sent_at <= now() - interval '24 hours' and qr.due_at > now()
    for update of qr skip locked
  loop
    update public.questionnaire_reviews set reminded_at = now() where id = r.id;
    perform public.notify(r.client_id, 'questionnaire.reminder', jsonb_build_object('project', r.project_id, 'code', r.code, 'due', r.due_at));
  end loop;

  for r in
    select qr.id, qr.project_id, p.code, p.client_id
    from public.questionnaire_reviews qr join public.projects p on p.id = qr.project_id
    where qr.status = 'pending' and qr.due_at <= now()
    for update of qr skip locked
  loop
    update public.questionnaire_reviews set status = 'auto_approved', decided_at = now() where id = r.id;
    perform public.notify(r.client_id, 'questionnaire.auto_approved', jsonb_build_object('project', r.project_id, 'code', r.code));
    perform public.notify_admins('admin.questionnaire_approved',
      jsonb_build_object('project', r.project_id, 'code', r.code, 'name', public.profile_name(r.client_id), 'auto', true));
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Kuesioner yang dikirim ke client, dalam bentuk yang dilihat client: tanpa bobot dan detail penilaian.
create or replace function public.client_questionnaire_view(p_snapshot jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'title', s.value ->> 'title',
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object('id', q.value ->> 'id', 'prompt', q.value ->> 'prompt', 'help', coalesce(q.value ->> 'help', ''),
                                          'photo', coalesce((q.value ->> 'photo_required')::boolean, false)) order by q.ordinality)
      from jsonb_array_elements(s.value -> 'questions') with ordinality q
    ), '[]'::jsonb)
  ) order by s.ordinality), '[]'::jsonb)
  from jsonb_array_elements(p_snapshot -> 'sections') with ordinality s;
$$;

-- Kuesioner proyek untuk client pemilik proyek. Null kalau belum dikirim.
create or replace function public.client_questionnaire_review(p_project uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  proj public.projects;
  cur public.questionnaire_reviews;
  prev public.questionnaire_reviews;
  used integer;
begin
  select * into proj from public.projects where id = p_project and client_id = auth.uid();
  if not found then
    raise exception 'Proyek tidak ditemukan.' using errcode = 'P0002';
  end if;
  perform public.questionnaire_review_tick();
  select r.* into cur from public.questionnaire_reviews r join public.project_questionnaires pq on pq.review_id = r.id where pq.project_id = p_project;
  if not found then
    return null;
  end if;
  used := public.questionnaire_revisions_used(p_project);
  select * into prev from public.questionnaire_reviews
  where project_id = p_project and status = 'changes_requested' and sent_at < cur.sent_at
  order by sent_at desc limit 1;
  return jsonb_build_object(
    'project', p_project, 'code', proj.code, 'status', cur.status, 'version', cur.version,
    'sent_at', cur.sent_at, 'due_at', cur.due_at, 'decided_at', cur.decided_at,
    'revisions_used', used, 'revisions_left', greatest(0, 2 - used),
    'flags', cur.flags, 'additions', cur.additions,
    'previous', case when prev.id is null then null else jsonb_build_object('version', prev.version, 'flags', prev.flags, 'additions', prev.additions) end,
    'sections', public.client_questionnaire_view(cur.snapshot)
  );
end;
$$;

-- Tanggapan client: setujui, atau ajukan perbaikan dengan pertanyaan yang ditandai ([{ question, note }]) dan usulan
-- pertanyaan tambahan.
create or replace function public.client_review_questionnaire(p_project uuid, p_approve boolean, p_flags jsonb default '[]'::jsonb, p_additions text default '')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  proj public.projects;
  cur public.questionnaire_reviews;
  v_additions text := btrim(coalesce(p_additions, ''));
  v_flags jsonb := '[]'::jsonb;
  f jsonb;
  q record;
  v_note text;
begin
  select * into proj from public.projects where id = p_project and client_id = auth.uid();
  if not found then
    raise exception 'Proyek tidak ditemukan.' using errcode = 'P0002';
  end if;
  perform public.questionnaire_review_tick();
  select r.* into cur from public.questionnaire_reviews r join public.project_questionnaires pq on pq.review_id = r.id
  where pq.project_id = p_project for update of r;
  if not found then
    raise exception 'Belum ada kuesioner yang dikirim untuk ditinjau.' using errcode = '22023';
  end if;
  if cur.status = 'auto_approved' then
    raise exception 'Batas tinjauan sudah lewat, jadi kuesioner sudah disetujui otomatis.' using errcode = '22023';
  end if;
  if cur.status <> 'pending' then
    raise exception 'Kuesioner ini sudah ditanggapi.' using errcode = '22023';
  end if;

  if coalesce(p_approve, false) then
    update public.questionnaire_reviews set status = 'approved', decided_at = now(), decided_by = auth.uid() where id = cur.id;
    perform public.notify_admins('admin.questionnaire_approved',
      jsonb_build_object('project', p_project, 'code', proj.code, 'name', public.profile_name(proj.client_id), 'auto', false));
    perform public.log_activity('project.questionnaire_approved', 'project', p_project::text, jsonb_build_object('review', cur.id));
    return jsonb_build_object('status', 'approved');
  end if;

  if jsonb_typeof(coalesce(p_flags, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_flags, '[]'::jsonb)) > 200 then
    raise exception 'Daftar pertanyaan yang ditandai tidak valid.' using errcode = '22023';
  end if;
  for f in select value from jsonb_array_elements(coalesce(p_flags, '[]'::jsonb)) loop
    select s.value ->> 'title' as section, qq.value ->> 'id' as id, qq.value ->> 'prompt' as prompt into q
    from jsonb_array_elements(cur.snapshot -> 'sections') s, jsonb_array_elements(s.value -> 'questions') qq
    where qq.value ->> 'id' = f ->> 'question';
    if q.id is null then
      raise exception 'Pertanyaan yang ditandai tidak ada di kuesioner ini. Muat ulang halaman.' using errcode = '22023';
    end if;
    v_note := btrim(coalesce(f ->> 'note', ''));
    if char_length(v_note) < 3 then
      raise exception 'Tulis apa yang perlu diubah untuk pertanyaan "%".', left(q.prompt, 80) using errcode = '22023';
    end if;
    if char_length(v_note) > 500 then
      raise exception 'Catatan perbaikan maksimal 500 karakter.' using errcode = '22023';
    end if;
    if not v_flags @> jsonb_build_array(jsonb_build_object('question', q.id)) then
      v_flags := v_flags || jsonb_build_array(jsonb_build_object('question', q.id, 'section', q.section, 'prompt', q.prompt, 'note', v_note));
    end if;
  end loop;
  if jsonb_array_length(v_flags) = 0 and v_additions = '' then
    raise exception 'Tandai minimal satu pertanyaan atau tulis pertanyaan yang ingin ditambahkan.' using errcode = '22023';
  end if;
  if char_length(v_additions) > 2000 then
    raise exception 'Usulan pertanyaan tambahan maksimal 2000 karakter.' using errcode = '22023';
  end if;

  update public.questionnaire_reviews
  set status = 'changes_requested', decided_at = now(), decided_by = auth.uid(), flags = v_flags, additions = v_additions
  where id = cur.id;
  perform public.notify_admins('admin.questionnaire_changes',
    jsonb_build_object('project', p_project, 'code', proj.code, 'name', public.profile_name(proj.client_id),
                       'count', jsonb_array_length(v_flags), 'version', cur.version));
  perform public.log_activity('project.questionnaire_changes', 'project', p_project::text,
    jsonb_build_object('review', cur.id, 'flags', jsonb_array_length(v_flags), 'additions', v_additions <> ''));
  return jsonb_build_object('status', 'changes_requested', 'revisions_left', greatest(0, 2 - public.questionnaire_revisions_used(p_project)));
end;
$$;

alter table public.questionnaire_reviews enable row level security;
create policy "admin membaca kiriman kuesioner" on public.questionnaire_reviews for select to authenticated using (public.is_admin());
revoke all on public.questionnaire_reviews from anon;
revoke insert, update, delete on public.questionnaire_reviews from authenticated;

revoke execute on function public.questionnaire_approved(uuid) from public, anon;
grant execute on function public.questionnaire_approved(uuid) to authenticated;
revoke execute on function public.questionnaire_revisions_used(uuid) from public, anon, authenticated;
revoke execute on function public.client_questionnaire_view(jsonb) from public, anon, authenticated;
revoke execute on function public.admin_send_questionnaire(uuid) from public, anon;
grant execute on function public.admin_send_questionnaire(uuid) to authenticated;
revoke execute on function public.admin_copy_questionnaire_for_project(uuid) from public, anon;
grant execute on function public.admin_copy_questionnaire_for_project(uuid) to authenticated;
revoke execute on function public.questionnaire_review_tick() from public, anon;
grant execute on function public.questionnaire_review_tick() to authenticated;
revoke execute on function public.client_questionnaire_review(uuid) from public, anon;
grant execute on function public.client_questionnaire_review(uuid) to authenticated;
revoke execute on function public.client_review_questionnaire(uuid, boolean, jsonb, text) from public, anon;
grant execute on function public.client_review_questionnaire(uuid, boolean, jsonb, text) to authenticated;

-- Jadwal 5 menitan (dari 20261030000013) ditambah pengingat dan persetujuan otomatis kuesioner.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('silentcx-expire', '*/5 * * * *',
      'select public.expire_overdue(); select public.expire_offers(); select public.questionnaire_review_tick();');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Edit profil
-- ---------------------------------------------------------------------------

-- Hari dan waktu shopper bisa berkunjung (opsional).
alter table public.shopper_applications
  add column available_days text[] not null default '{}'
    check (available_days <@ array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']::text[]),
  add column available_times text[] not null default '{}'
    check (available_times <@ array['morning', 'afternoon', 'evening']::text[]);

-- Riwayat perubahan data akun, dibaca admin di Detail akun.
create table public.profile_changes (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  field text not null check (field ~ '^[a-z_]+$'),
  old_value text not null default '' check (char_length(old_value) <= 600),
  new_value text not null default '' check (char_length(new_value) <= 600),
  -- Kosong = lewat tautan konfirmasi email (tanpa sesi).
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);

create index profile_changes_user_idx on public.profile_changes (user_id, changed_at desc);

alter table public.profile_changes enable row level security;
create policy "admin membaca riwayat perubahan" on public.profile_changes for select to authenticated using (public.is_admin());
revoke all on public.profile_changes from anon;
revoke insert, update, delete on public.profile_changes from authenticated;

create or replace function public.log_profile_change(p_user uuid, p_field text, p_old text, p_new text) returns void
language sql security definer set search_path = public as $$
  insert into public.profile_changes (user_id, field, old_value, new_value, changed_by)
  select p_user, p_field, left(coalesce(p_old, ''), 600), left(coalesce(p_new, ''), 600), auth.uid()
  where coalesce(p_old, '') is distinct from coalesce(p_new, '');
$$;

revoke execute on function public.log_profile_change(uuid, text, text, text) from public, anon, authenticated;

create or replace function public.track_profile_changes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.log_profile_change(new.id, 'full_name', old.full_name, new.full_name);
  perform public.log_profile_change(new.id, 'phone', old.phone, new.phone);
  perform public.log_profile_change(new.id, 'email', old.email, new.email);
  return null;
end;
$$;

create trigger profiles_track_changes after update of full_name, phone, email on public.profiles
  for each row execute function public.track_profile_changes();

-- Lamaran yang sudah disetujui = data profil shopper. Perubahan saat lamaran masih draf tidak dicatat.
create or replace function public.track_application_changes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status <> 'approved' or new.status <> 'approved' then
    return null;
  end if;
  perform public.log_profile_change(new.shopper_id, 'domicile', old.domicile, new.domicile);
  perform public.log_profile_change(new.shopper_id, 'reachable_cities', array_to_string(old.reachable_cities, ', '), array_to_string(new.reachable_cities, ', '));
  perform public.log_profile_change(new.shopper_id, 'birth_date', old.birth_date::text, new.birth_date::text);
  perform public.log_profile_change(new.shopper_id, 'gender', old.gender, new.gender);
  perform public.log_profile_change(new.shopper_id, 'occupation', old.occupation, new.occupation);
  perform public.log_profile_change(new.shopper_id, 'vehicle', old.vehicle, new.vehicle);
  perform public.log_profile_change(new.shopper_id, 'industries', array_to_string(old.industries, ', '), array_to_string(new.industries, ', '));
  perform public.log_profile_change(new.shopper_id, 'available_days', array_to_string(old.available_days, ', '), array_to_string(new.available_days, ', '));
  perform public.log_profile_change(new.shopper_id, 'available_times', array_to_string(old.available_times, ', '), array_to_string(new.available_times, ', '));
  return null;
end;
$$;

create trigger shopper_applications_track_changes after update on public.shopper_applications
  for each row execute function public.track_application_changes();

-- Nomor rekening dicatat tersamar (4 angka terakhir).
create or replace function public.track_bank_changes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.log_profile_change(new.shopper_id, 'bank_name', old.bank_name, new.bank_name);
  perform public.log_profile_change(new.shopper_id, 'account_number', '••••' || right(old.account_number, 4), '••••' || right(new.account_number, 4));
  perform public.log_profile_change(new.shopper_id, 'account_holder', old.account_holder, new.account_holder);
  return null;
end;
$$;

create trigger shopper_bank_accounts_track_changes after update on public.shopper_bank_accounts
  for each row execute function public.track_bank_changes();

create or replace function public.track_company_changes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.log_profile_change(new.client_id, 'company_name', old.name, new.name);
  perform public.log_profile_change(new.client_id, 'company_industry', old.industry, new.industry);
  perform public.log_profile_change(new.client_id, 'company_city', old.city, new.city);
  perform public.log_profile_change(new.client_id, 'company_address', old.address, new.address);
  return null;
end;
$$;

create trigger companies_track_changes after update on public.companies
  for each row execute function public.track_company_changes();

revoke execute on function public.track_profile_changes() from public, anon, authenticated;
revoke execute on function public.track_application_changes() from public, anon, authenticated;
revoke execute on function public.track_bank_changes() from public, anon, authenticated;
revoke execute on function public.track_company_changes() from public, anon, authenticated;

-- Email profil mengikuti email login (dari 20261027000001). Setelah email baru dikonfirmasi, alamat lama menerima
-- pemberitahuan supaya pemilik akun tahu kalau penggantian itu bukan dari dirinya.
create or replace function public.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old text;
begin
  if new.email is distinct from old.email then
    select email into v_old from public.profiles where id = new.id;
    update public.profiles set email = lower(new.email) where id = new.id;
    if v_old is not null and v_old <> lower(new.email) then
      perform public.notify(new.id, 'account.email_changed', jsonb_build_object('old_email', v_old, 'new_email', lower(new.email)));
    end if;
  end if;
  return new;
end;
$$;

-- Data profil shopper yang sudah aktif. Hanya kunci yang dikirim yang diubah, jadi setiap bagian di Akun saya bisa
-- disimpan sendiri. p_data: { domicile, reachable_cities[], birth_date, gender, occupation, vehicle, industries[],
-- available_days[], available_times[] }. Perubahan berlaku untuk tawaran tugas berikutnya.
create or replace function public.shopper_update_profile(p_data jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  prof public.profiles;
  app public.shopper_applications;
  cities text[] := '{}';
  c text;
  canonical text;
  v_birth date;
begin
  select * into prof from public.profiles where id = auth.uid();
  if not found or prof.role <> 'shopper' or prof.status <> 'active' then
    raise exception 'Profil bisa diubah di sini setelah akun shopper aktif.' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_data, 'null'::jsonb)) <> 'object' then
    raise exception 'Data profil tidak valid.' using errcode = '22023';
  end if;

  select * into app from public.shopper_applications where shopper_id = prof.id and status = 'approved'
  order by decided_at desc nulls last, created_at desc limit 1 for update;
  -- Akun buatan admin belum punya lamaran: dibuatkan sebagai data profil yang sudah disetujui.
  if not found then
    insert into public.shopper_applications (shopper_id, status, decided_at) values (prof.id, 'approved', now()) returning * into app;
  end if;

  if p_data ? 'domicile' and btrim(coalesce(p_data ->> 'domicile', '')) = '' then
    raise exception 'Isi kota domisili.' using errcode = '22023';
  end if;
  if p_data ? 'occupation' and btrim(coalesce(p_data ->> 'occupation', '')) = '' then
    raise exception 'Isi pekerjaan.' using errcode = '22023';
  end if;
  if p_data ? 'gender' and coalesce(p_data ->> 'gender', '') not in ('female', 'male') then
    raise exception 'Pilih jenis kelamin.' using errcode = '22023';
  end if;
  if p_data ? 'vehicle' and coalesce(p_data ->> 'vehicle', '') not in ('none', 'motorcycle', 'car', 'both') then
    raise exception 'Pilih kendaraan.' using errcode = '22023';
  end if;
  if p_data ? 'birth_date' then
    v_birth := nullif(p_data ->> 'birth_date', '')::date;
    if v_birth is null or v_birth > (now() at time zone 'Asia/Jakarta')::date - interval '18 years' or v_birth < date '1940-01-01' then
      raise exception 'Usia shopper minimal 18 tahun. Periksa tanggal lahir.' using errcode = '22023';
    end if;
  end if;
  if p_data ? 'reachable_cities' then
    -- Kota yang sudah dipilih tetap boleh disimpan walaupun kini tidak dilayani; kota baru harus dari daftar aktif.
    for c in select btrim(x) from jsonb_array_elements_text(coalesce(p_data -> 'reachable_cities', '[]'::jsonb)) as x where btrim(x) <> '' loop
      canonical := null;
      select s.name into canonical from public.service_cities s where s.active and lower(btrim(s.name)) = lower(c);
      if canonical is null then
        select x into canonical from unnest(app.reachable_cities) as x where lower(x) = lower(c) limit 1;
      end if;
      if canonical is null then
        raise exception 'Kota % tidak ada di daftar kota yang dilayani.', c using errcode = '22023';
      end if;
      if not canonical = any (cities) then
        cities := cities || canonical;
      end if;
    end loop;
    if cardinality(cities) = 0 then
      raise exception 'Pilih minimal satu kota yang bisa Anda jangkau.' using errcode = '22023';
    end if;
    if cardinality(cities) > 20 then
      raise exception 'Pilih paling banyak 20 kota.' using errcode = '22023';
    end if;
  end if;
  if p_data ? 'industries' and jsonb_array_length(coalesce(p_data -> 'industries', '[]'::jsonb)) = 0 then
    raise exception 'Pilih minimal satu jenis bisnis yang Anda minati.' using errcode = '22023';
  end if;

  update public.shopper_applications set
    domicile = case when p_data ? 'domicile' then left(btrim(p_data ->> 'domicile'), 80) else domicile end,
    reachable_cities = case when p_data ? 'reachable_cities' then cities else reachable_cities end,
    birth_date = case when p_data ? 'birth_date' then v_birth else birth_date end,
    gender = case when p_data ? 'gender' then p_data ->> 'gender' else gender end,
    occupation = case when p_data ? 'occupation' then left(btrim(p_data ->> 'occupation'), 80) else occupation end,
    vehicle = case when p_data ? 'vehicle' then p_data ->> 'vehicle' else vehicle end,
    -- Urutan pilihan dijaga (hari: Senin–Minggu), duplikat dibuang.
    industries = case when p_data ? 'industries'
      then array(select x from jsonb_array_elements_text(p_data -> 'industries') with ordinality e(x, n) group by x order by min(n)) else industries end,
    available_days = case when p_data ? 'available_days'
      then array(select x from jsonb_array_elements_text(coalesce(p_data -> 'available_days', '[]'::jsonb)) as x group by x
                 order by array_position(array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], x)) else available_days end,
    available_times = case when p_data ? 'available_times'
      then array(select x from jsonb_array_elements_text(coalesce(p_data -> 'available_times', '[]'::jsonb)) as x group by x
                 order by array_position(array['morning', 'afternoon', 'evening'], x)) else available_times end
  where id = app.id;
end;
$$;

revoke execute on function public.shopper_update_profile(jsonb) from public, anon;
grant execute on function public.shopper_update_profile(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Email notifikasi baru
-- ---------------------------------------------------------------------------

-- Daftar ini sama dengan EMAIL_KINDS di src/lib/email-content.ts (dicek tes).
create or replace function public.is_email_kind(p_kind text) returns boolean
language sql immutable as $$
  select p_kind in (
    'task.offered', 'task.revision', 'application.approved', 'application.rejected', 'payout.paid',
    'order.ready', 'invoice.paid', 'invoice.rejected', 'invoice.due_soon', 'report.published',
    'admin.payment', 'chat.reply',
    'questionnaire.review', 'questionnaire.reminder', 'questionnaire.auto_approved', 'questionnaire.final',
    'admin.questionnaire_changes', 'account.email_changed'
  );
$$;
