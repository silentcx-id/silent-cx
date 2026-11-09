-- Putaran 18: fitur konsultasi dihapus. Paket hanya berisi kunjungan dan laporan.
--
-- Tabel consultations dan consultation_windows beserta fungsinya tidak di-drop: datanya tetap ada sebagai riwayat
-- dan fitur bisa dipasang lagi tanpa membangun ulang. Yang dimatikan: jatah sesi dari paket, add-on Konsultasi tambahan,
-- pembelian sesi tambahan, dan semua teks yang menjanjikan sesi konsultasi.

-- ---------------------------------------------------------------------------
-- 1. Paket: tanpa jatah konsultasi dan tanpa teks fitur konsultasi/debrief.
-- ---------------------------------------------------------------------------

update public.packages
set consultation_minutes = 0,
    entitlements = array_remove(entitlements, 'consultation'),
    features = array(select f from unnest(features) f where f !~* '^\s*(konsultasi|debrief)'),
    features_en = case when features_en is null then null
      else array(select f from unnest(features_en) f where f !~* '^\s*(consultation|debrief)') end;

-- ---------------------------------------------------------------------------
-- 2. Add-on Konsultasi tambahan tidak dijual lagi.
-- ---------------------------------------------------------------------------

update public.addons set active = false where key = 'additional_consultation';

-- ---------------------------------------------------------------------------
-- 3. Tidak ada jatah sesi baru saat laporan terbit, dan client tidak bisa membeli sesi tambahan.
-- ---------------------------------------------------------------------------

drop trigger if exists reports_grant_consultations on public.reports;
revoke execute on function public.client_buy_consultation(uuid, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Konten landing: kartu fitur "Konsultasi" dihapus dari draft dan versi terbit.
-- ---------------------------------------------------------------------------

create or replace function public.drop_consultation_card(c jsonb) returns jsonb
language sql immutable as $$
  select case
    when c is null or jsonb_typeof(c #> '{sections,features,items}') is distinct from 'array' then c
    else jsonb_set(c, '{sections,features,items}', coalesce((
      select jsonb_agg(i order by n)
      from jsonb_array_elements(c #> '{sections,features,items}') with ordinality as x(i, n)
      where coalesce(i #>> '{title,id}', '') !~* '^\s*konsultasi\s*$'
    ), '[]'::jsonb))
  end
$$;

update public.site_content
set draft = public.drop_consultation_card(draft),
    published = public.drop_consultation_card(published);

drop function public.drop_consultation_card(jsonb);

-- ---------------------------------------------------------------------------
-- 5. Artikel promo: tidak menyebut sesi konsultasi atau add-on Konsultasi tambahan.
-- ---------------------------------------------------------------------------

update public.articles
set body = replace(replace(body,
      'tingkat keparahan temuan, analisis gap, dan konsultasi 30 menit bersama tim SilentCX.',
      'tingkat keparahan temuan, dan analisis gap.'),
      'benchmark kompetitor, konsultasi tambahan, dan laporan express.',
      'benchmark kompetitor, dan laporan express.'),
    excerpt = replace(excerpt, ', dan konsultasi 30 menit', '')
where body ilike '%konsultasi%' or excerpt ilike '%konsultasi%';
