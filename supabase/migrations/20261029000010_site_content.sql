-- Putaran 4: CMS halaman publik.
--
-- Isi landing page dan panel samping halaman masuk/daftar disimpan sebagai satu dokumen JSON.
-- Admin mengedit draf, melihat pratinjau, lalu menerbitkan. Pengunjung hanya pernah membaca versi terbit.
-- Bentuk dokumen dan isi bawaannya ada di src/lib/site-content.ts; kalau belum pernah terbit,
-- halaman memakai isi bawaan itu.
-- Tabel tidak dibuka langsung: baca dan tulis lewat fungsi di bawah.

create table public.site_content (
  id text primary key default 'site' check (id = 'site'),
  draft jsonb not null check (jsonb_typeof(draft) = 'object'),
  draft_updated_at timestamptz not null default now(),
  draft_updated_by uuid references public.profiles (id) on delete set null,
  published jsonb check (published is null or jsonb_typeof(published) = 'object'),
  published_at timestamptz,
  published_by uuid references public.profiles (id) on delete set null
);

alter table public.site_content enable row level security;
revoke all on public.site_content from anon, authenticated;

-- Versi terbit untuk halaman publik; null kalau belum pernah terbit.
create or replace function public.public_site_content()
returns jsonb
language sql stable security definer set search_path = public as $$
  select published from public.site_content where id = 'site';
$$;

-- Draf dan statusnya untuk editor admin.
create or replace function public.admin_site_content()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_row public.site_content;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa mengatur konten.' using errcode = '42501';
  end if;
  select * into v_row from public.site_content where id = 'site';
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'draft', v_row.draft,
    'draft_updated_at', v_row.draft_updated_at,
    'published_at', v_row.published_at,
    -- Draf berbeda dari versi terbit: ada perubahan yang belum dilihat pengunjung.
    'unpublished', v_row.published is distinct from v_row.draft
  );
end;
$$;

create or replace function public.admin_save_site_draft(p_draft jsonb)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa mengatur konten.' using errcode = '42501';
  end if;
  if p_draft is null or jsonb_typeof(p_draft) <> 'object' then
    raise exception 'Isi konten tidak valid.' using errcode = '22023';
  end if;
  insert into public.site_content (id, draft, draft_updated_at, draft_updated_by)
  values ('site', p_draft, now(), auth.uid())
  on conflict (id) do update set draft = excluded.draft, draft_updated_at = now(), draft_updated_by = auth.uid();
end;
$$;

-- Menerbitkan draf yang tersimpan apa adanya.
create or replace function public.admin_publish_site()
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v_at timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa menerbitkan konten.' using errcode = '42501';
  end if;
  update public.site_content set published = draft, published_at = now(), published_by = auth.uid()
  where id = 'site'
  returning published_at into v_at;
  if v_at is null then
    raise exception 'Simpan draf dulu sebelum menerbitkan.' using errcode = '22023';
  end if;
  perform public.log_activity('site.published', 'site_content', 'site', '{}'::jsonb);
  return v_at;
end;
$$;

-- Membuang perubahan draf dan kembali ke versi terbit terakhir.
create or replace function public.admin_discard_site_draft()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa mengatur konten.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.site_content where id = 'site' and published is not null) then
    raise exception 'Belum ada versi terbit untuk dikembalikan.' using errcode = '22023';
  end if;
  update public.site_content set draft = published, draft_updated_at = now(), draft_updated_by = auth.uid() where id = 'site';
end;
$$;

revoke execute on function public.admin_site_content(), public.admin_save_site_draft(jsonb), public.admin_publish_site(), public.admin_discard_site_draft() from public, anon;
grant execute on function public.admin_site_content(), public.admin_save_site_draft(jsonb), public.admin_publish_site(), public.admin_discard_site_draft() to authenticated;
grant execute on function public.public_site_content() to anon, authenticated;
