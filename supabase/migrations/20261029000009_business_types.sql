-- Putaran 3: daftar jenis usaha yang diatur admin.
--
-- Sebelumnya jenis usaha tertulis tetap di kode dan di constraint kolom. Sekarang admin menambah, mengganti
-- nama, dan menonaktifkan jenis usaha di Katalog. Daftar yang sama dipakai di data perusahaan client,
-- lamaran shopper (industri yang diminati), dan kuesioner.
-- Kode (key) tidak bisa diubah setelah dibuat, supaya data lama tetap merujuk ke jenis yang sama.
-- Jenis yang dinonaktifkan tidak muncul di pilihan baru, tetapi data lama yang memakainya tetap sah dan
-- namanya tetap terbaca, jadi daftar ini terbuka dibaca semua orang (isinya bukan rahasia).

create table public.business_types (
  key text primary key check (key ~ '^[a-z0-9_]{2,40}$'),
  label_id text not null check (char_length(btrim(label_id)) between 2 and 60),
  label_en text not null default '' check (char_length(label_en) <= 60),
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index business_types_label_idx on public.business_types (lower(btrim(label_id)));

-- Kode sama dengan yang sudah dipakai di lamaran shopper dan kuesioner. "Lainnya" selalu di urutan terakhir.
insert into public.business_types (key, label_id, label_en, sort_order) values
  ('fnb', 'F&B', 'F&B', 10),
  ('retail', 'Retail', 'Retail', 20),
  ('hospitality', 'Hospitality/Hotel', 'Hospitality & hotels', 30),
  ('banking', 'Perbankan & Keuangan', 'Banking & finance', 40),
  ('automotive', 'Otomotif', 'Automotive', 50),
  ('health', 'Kesehatan & Klinik', 'Health & clinics', 60),
  ('beauty', 'Kecantikan & Salon', 'Beauty & salons', 70),
  ('telco', 'Telekomunikasi', 'Telecom', 80),
  ('other', 'Lainnya', 'Other', 1000);

alter table public.business_types enable row level security;
create policy "jenis usaha terbuka" on public.business_types for select to anon, authenticated using (true);
create policy "admin mengelola jenis usaha" on public.business_types for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke insert, update, delete on public.business_types from anon;
-- Kode tidak boleh diganti; admin hanya mengubah nama, urutan, dan status aktif.
revoke update on public.business_types from authenticated;
grant update (label_id, label_en, sort_order, active) on public.business_types to authenticated;

-- ---------------------------------------------------------------------------
-- Kolom yang memakai daftar ini
-- ---------------------------------------------------------------------------

-- Kuesioner: dari constraint tetap menjadi rujukan ke daftar. Jenis yang dipakai kuesioner tidak bisa dihapus.
alter table public.questionnaires drop constraint if exists questionnaires_business_type_check;
alter table public.questionnaires
  add constraint questionnaires_business_type_fkey foreign key (business_type) references public.business_types (key) on delete restrict;

-- Lamaran shopper: setiap industri harus ada di daftar.
alter table public.shopper_applications drop constraint if exists shopper_applications_industries_check;

create or replace function public.check_business_types()
returns trigger
language plpgsql set search_path = public as $$
declare
  unknown text;
begin
  select x into unknown from unnest(new.industries) as x
  where not exists (select 1 from public.business_types b where b.key = x)
  limit 1;
  if unknown is not null then
    raise exception 'Jenis usaha "%" tidak ada di daftar.', unknown using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger shopper_applications_business_types
  before insert or update of industries on public.shopper_applications
  for each row execute function public.check_business_types();

-- Data perusahaan client: kolom industry sebelumnya teks bebas, sekarang menyimpan kode jenis usaha.
-- Isian lama yang cocok dengan nama atau kode diubah ke kodenya; yang tidak cocok dibiarkan dan tetap
-- tampil apa adanya sampai client memilih ulang.
update public.companies c set industry = b.key
from public.business_types b
where c.industry <> '' and lower(btrim(c.industry)) in (lower(b.label_id), lower(b.label_en), b.key);

create or replace function public.check_company_industry()
returns trigger
language plpgsql set search_path = public as $$
begin
  if new.industry <> '' and (tg_op = 'INSERT' or new.industry is distinct from old.industry)
     and not exists (select 1 from public.business_types b where b.key = new.industry and b.active) then
    raise exception 'Pilih jenis usaha dari daftar.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger companies_industry
  before insert or update of industry on public.companies
  for each row execute function public.check_company_industry();
