-- Putaran 15: voucher promo khusus brand dan artikel.
--
-- 1. Voucher: admin membuat satu voucher untuk satu brand (nama dan logo brand, potongan per paket, masa berlaku).
--    Kodenya dibentuk dari nama brand ditambah 4 karakter acak, misalnya KOPISENJA-7K2Q. Sekali pakai.
-- 2. Client memasukkan kode voucher di tagihan pesanan paket yang belum dibayar. Voucher tidak digabung dengan promo
--    paket: kalau paket sedang promo, promo itu dilepas (harga paket kembali normal) lalu potongan voucher dipasang.
--    Promo add-on tetap berlaku karena voucher hanya memotong harga paket. Voucher bisa dilepas sebelum bukti bayar
--    diunggah, dan promo paket semula dipulihkan. Kalau tagihan kedaluwarsa atau dibatalkan, voucher kembali bisa dipakai.
-- 3. Artikel: admin menulis artikel per kategori (misalnya Promo) untuk halaman publik /artikel.

-- ---------------------------------------------------------------------------
-- 1. Voucher
-- ---------------------------------------------------------------------------

create table public.vouchers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9-]{3,29}$'),
  brand_name text not null check (char_length(btrim(brand_name)) between 1 and 80),
  brand_logo text not null default '' check (char_length(brand_logo) <= 500),
  -- Potongan per paket: [{ "package": "essential", "pct": 50 }, { "package": "performance", "amount": 999000 }].
  rules jsonb not null check (jsonb_typeof(rules) = 'array' and jsonb_array_length(rules) between 1 and 20),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text not null default '' check (char_length(note) <= 300),
  -- Tagihan yang memakai voucher ini (satu voucher hanya untuk satu tagihan).
  invoice_id uuid unique references public.invoices (id) on delete set null,
  redeemed_at timestamptz,
  redeemed_by uuid references public.profiles (id) on delete set null,
  -- Harga paket dan baris promo sebelum voucher dipasang, untuk dipulihkan saat voucher dilepas.
  restore jsonb,
  cancelled_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vouchers_dates check (ends_at > starts_at)
);

create trigger vouchers_touch before update on public.vouchers
  for each row execute function public.touch_updated_at();

alter table public.vouchers enable row level security;
create policy "admin membaca voucher" on public.vouchers for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.vouchers from anon, authenticated;

-- Kode dari nama brand: huruf dan angka saja, maksimal 12, misalnya "Kopi Senja!" → KOPISENJA.
create or replace function public.voucher_code_base(p_brand text) returns text
language sql immutable as $$
  select coalesce(nullif(left(upper(regexp_replace(coalesce(p_brand, ''), '[^A-Za-z0-9]', '', 'g')), 12), ''), 'SCX');
$$;

-- 4 karakter acak tanpa huruf atau angka yang mirip (0/O, 1/I/L).
create or replace function public.voucher_code_suffix() returns text
language sql volatile as $$
  select string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + floor(random() * 31)::integer, 1), '')
  from generate_series(1, 4);
$$;

-- Memeriksa dan merapikan potongan per paket. Setiap paket hanya sekali; potongan nominal di bawah harga termurah paket.
create or replace function public.voucher_clean_rules(p_rules jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r jsonb;
  pkg public.packages;
  cheapest integer;
  pct integer;
  amount integer;
  seen text[] := '{}';
  out jsonb := '[]'::jsonb;
begin
  if p_rules is null or jsonb_typeof(p_rules) <> 'array' or jsonb_array_length(p_rules) = 0 then
    raise exception 'Pilih minimal satu paket dan isi potongannya.' using errcode = '22023';
  end if;
  for r in select value from jsonb_array_elements(p_rules) loop
    select * into pkg from public.packages where key = r ->> 'package';
    if not found then
      raise exception 'Paket voucher tidak ditemukan.' using errcode = '22023';
    end if;
    if pkg.key = any(seen) then
      raise exception 'Paket % dipilih lebih dari sekali.', pkg.name using errcode = '22023';
    end if;
    seen := seen || pkg.key;
    pct := nullif(r ->> 'pct', '')::integer;
    amount := nullif(r ->> 'amount', '')::integer;
    if (pct is null) = (amount is null) then
      raise exception 'Isi potongan % dalam persen atau nominal (pilih salah satu).', pkg.name using errcode = '22023';
    end if;
    if pct is not null and (pct < 1 or pct > 100) then
      raise exception 'Potongan % harus 1 sampai 100 persen.', pkg.name using errcode = '22023';
    end if;
    if amount is not null then
      select min(price) into cheapest from public.package_prices where package_id = pkg.id;
      if amount < 1000 or (cheapest is not null and amount >= cheapest) then
        raise exception 'Potongan % harus di bawah harga termurahnya (Rp%).', pkg.name, public.rp_text(cheapest) using errcode = '22023';
      end if;
    end if;
    out := out || jsonb_build_array(case when pct is not null then jsonb_build_object('package', pkg.key, 'pct', pct)
                                         else jsonb_build_object('package', pkg.key, 'amount', amount) end);
  end loop;
  return out;
end;
$$;

-- Admin membuat voucher. p_code kosong = kode dibuat otomatis dari nama brand.
create or replace function public.admin_create_voucher(p_brand text, p_logo text, p_rules jsonb, p_starts timestamptz, p_ends timestamptz,
                                                      p_code text default null, p_note text default '')
returns public.vouchers
language plpgsql security definer set search_path = public as $$
declare
  v public.vouchers;
  v_code text := nullif(upper(btrim(coalesce(p_code, ''))), '');
  tries integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa membuat voucher.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_brand, ''))) = 0 then
    raise exception 'Nama brand wajib diisi.' using errcode = '22023';
  end if;
  if p_starts is null or p_ends is null or p_ends <= p_starts then
    raise exception 'Tanggal berakhir harus setelah tanggal mulai.' using errcode = '22023';
  end if;
  if v_code is not null then
    if v_code !~ '^[A-Z0-9][A-Z0-9-]{3,29}$' then
      raise exception 'Kode voucher 4 sampai 30 karakter: huruf, angka, dan tanda hubung.' using errcode = '22023';
    end if;
    if exists (select 1 from public.vouchers where code = v_code) then
      raise exception 'Kode % sudah dipakai voucher lain.', v_code using errcode = '23505';
    end if;
  else
    loop
      v_code := public.voucher_code_base(p_brand) || '-' || public.voucher_code_suffix();
      exit when not exists (select 1 from public.vouchers where code = v_code);
      tries := tries + 1;
      if tries > 20 then
        raise exception 'Gagal membuat kode unik. Coba lagi.' using errcode = '22023';
      end if;
    end loop;
  end if;

  insert into public.vouchers (code, brand_name, brand_logo, rules, starts_at, ends_at, note, created_by)
  values (v_code, btrim(p_brand), coalesce(p_logo, ''), public.voucher_clean_rules(p_rules), p_starts, p_ends, left(btrim(coalesce(p_note, '')), 300), auth.uid())
  returning * into v;
  perform public.log_activity('voucher.created', 'voucher', v.id::text, jsonb_build_object('code', v.code, 'brand', v.brand_name));
  return v;
end;
$$;

-- Admin mengubah voucher yang belum dipakai.
create or replace function public.admin_update_voucher(p_id uuid, p_brand text, p_logo text, p_rules jsonb, p_starts timestamptz, p_ends timestamptz, p_note text default '')
returns void
language plpgsql security definer set search_path = public as $$
declare
  v public.vouchers;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa mengubah voucher.' using errcode = '42501';
  end if;
  select * into v from public.vouchers where id = p_id for update;
  if not found then
    raise exception 'Voucher tidak ditemukan.' using errcode = 'P0002';
  end if;
  if v.invoice_id is not null then
    raise exception 'Voucher sudah dipakai client, jadi tidak bisa diubah.' using errcode = '22023';
  end if;
  if v.cancelled_at is not null then
    raise exception 'Voucher sudah dibatalkan.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_brand, ''))) = 0 then
    raise exception 'Nama brand wajib diisi.' using errcode = '22023';
  end if;
  if p_starts is null or p_ends is null or p_ends <= p_starts then
    raise exception 'Tanggal berakhir harus setelah tanggal mulai.' using errcode = '22023';
  end if;
  update public.vouchers
  set brand_name = btrim(p_brand), brand_logo = coalesce(p_logo, ''), rules = public.voucher_clean_rules(p_rules),
      starts_at = p_starts, ends_at = p_ends, note = left(btrim(coalesce(p_note, '')), 300)
  where id = p_id;
  perform public.log_activity('voucher.updated', 'voucher', p_id::text, jsonb_build_object('code', v.code));
end;
$$;

-- Admin membatalkan voucher yang belum dipakai.
create or replace function public.admin_cancel_voucher(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v public.vouchers;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa membatalkan voucher.' using errcode = '42501';
  end if;
  select * into v from public.vouchers where id = p_id for update;
  if not found then
    raise exception 'Voucher tidak ditemukan.' using errcode = 'P0002';
  end if;
  if v.invoice_id is not null then
    raise exception 'Voucher sudah dipakai di tagihan %, jadi tidak bisa dibatalkan.', (select code from public.invoices where id = v.invoice_id) using errcode = '22023';
  end if;
  update public.vouchers set cancelled_at = coalesce(cancelled_at, now()) where id = p_id;
  perform public.log_activity('voucher.cancelled', 'voucher', p_id::text, jsonb_build_object('code', v.code));
end;
$$;

-- Status voucher untuk tampilan: cancelled, used (tagihan lunas), claimed (terpasang di tagihan belum lunas),
-- scheduled, expired, active.
create or replace function public.voucher_state(v public.vouchers) returns text
language sql stable security definer set search_path = public as $$
  select case
    when v.cancelled_at is not null then 'cancelled'
    when v.invoice_id is not null and exists (select 1 from public.invoices i where i.id = v.invoice_id and i.status = 'paid') then 'used'
    when v.invoice_id is not null then 'claimed'
    when now() < v.starts_at then 'scheduled'
    when now() >= v.ends_at then 'expired'
    else 'active'
  end;
$$;

-- Potongan per paket dengan nama paket, untuk halaman voucher dan kartu voucher.
create or replace function public.voucher_rules_view(p_rules jsonb) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('package', p.key, 'name', p.name, 'pct', r.value -> 'pct', 'amount', r.value -> 'amount',
                                               'price', (select min(pp.price) from public.package_prices pp where pp.package_id = p.id))
                            order by p.sort_order, p.name), '[]'::jsonb)
  from jsonb_array_elements(p_rules) r
  join public.packages p on p.key = r.value ->> 'package';
$$;

-- Kartu voucher publik (halaman /voucher/KODE). Kode adalah rahasianya: tanpa kode yang tepat tidak ada yang tampil.
create or replace function public.voucher_card(p_code text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'code', v.code, 'brand', v.brand_name, 'logo', v.brand_logo, 'starts_at', v.starts_at, 'ends_at', v.ends_at,
    'state', public.voucher_state(v), 'rules', public.voucher_rules_view(v.rules))
  from public.vouchers v
  where v.code = upper(btrim(coalesce(p_code, '')));
$$;

-- Potongan voucher untuk harga paket tertentu; null kalau paket tidak termasuk.
create or replace function public.voucher_discount(p_rules jsonb, p_package text, p_price integer) returns integer
language sql immutable as $$
  select case
    when r.value ? 'pct' then least(round(p_price * (r.value ->> 'pct')::integer / 100.0)::integer, p_price)
    else least((r.value ->> 'amount')::integer, p_price)
  end
  from jsonb_array_elements(p_rules) r
  where r.value ->> 'package' = p_package
  limit 1;
$$;

-- Hitungan voucher untuk tagihan client tanpa mengubah apa pun: dipakai untuk perbandingan sebelum dipasang.
-- Melempar pesan yang jelas kalau voucher tidak bisa dipakai.
create or replace function public.client_voucher_quote(p_invoice uuid, p_code text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  inv public.invoices;
  proj public.projects;
  v public.vouchers;
  pkg_line public.invoice_lines;
  pkg_key text;
  disc integer;
  promo integer;
  others integer;
  names text;
  state text;
begin
  select * into inv from public.invoices where id = p_invoice and client_id = auth.uid();
  if not found then
    raise exception 'Tagihan tidak ditemukan.' using errcode = 'P0002';
  end if;
  select * into proj from public.projects where id = inv.project_id;
  if inv.kind <> 'order' or proj.parent_project_id is not null then
    raise exception 'Voucher hanya untuk tagihan pesanan paket.' using errcode = '22023';
  end if;
  if inv.status <> 'unpaid' then
    raise exception 'Voucher hanya bisa dipakai sebelum bukti bayar diunggah.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_code, ''))) = 0 then
    raise exception 'Masukkan kode voucher.' using errcode = '22023';
  end if;
  select * into v from public.vouchers where code = upper(btrim(p_code));
  if not found then
    raise exception 'Kode voucher % tidak ditemukan. Periksa lagi penulisannya.', upper(btrim(p_code)) using errcode = '22023';
  end if;
  if v.invoice_id = inv.id then
    raise exception 'Voucher ini sudah terpasang di tagihan Anda.' using errcode = '22023';
  end if;
  state := public.voucher_state(v);
  if state = 'cancelled' then
    raise exception 'Voucher % sudah tidak berlaku.', v.code using errcode = '22023';
  elsif state in ('used', 'claimed') then
    raise exception 'Voucher % sudah dipakai.', v.code using errcode = '22023';
  elsif state = 'scheduled' then
    raise exception 'Voucher % baru berlaku mulai %.', v.code, public.wib_date(v.starts_at) using errcode = '22023';
  elsif state = 'expired' then
    raise exception 'Voucher % sudah berakhir %.', v.code, public.wib_date(v.ends_at - interval '1 second') using errcode = '22023';
  end if;
  if exists (select 1 from public.vouchers where invoice_id = inv.id) then
    raise exception 'Tagihan ini sudah memakai voucher lain. Lepas voucher itu dulu.' using errcode = '22023';
  end if;

  select * into pkg_line from public.invoice_lines where invoice_id = inv.id and kind = 'package' order by position limit 1;
  pkg_key := coalesce(pkg_line.item_key, proj.package_snapshot ->> 'key');
  disc := public.voucher_discount(v.rules, pkg_key, coalesce(pkg_line.list_price, pkg_line.amount));
  if disc is null then
    select string_agg(x ->> 'name', ', ') into names from jsonb_array_elements(public.voucher_rules_view(v.rules)) x;
    raise exception 'Voucher % berlaku untuk paket %. Pesanan Anda paket %.', v.code, names, proj.package_snapshot ->> 'name' using errcode = '22023';
  end if;

  -- Promo paket yang akan dilepas: selisih harga promo paket ditambah baris promo (misalnya gratis 1 outlet).
  promo := greatest(coalesce(pkg_line.list_price, pkg_line.amount) - pkg_line.amount, 0)
           - coalesce((select sum(amount) from public.invoice_lines where invoice_id = inv.id and kind = 'promo'), 0);
  others := inv.total - pkg_line.amount - coalesce((select sum(amount) from public.invoice_lines where invoice_id = inv.id and kind = 'promo'), 0);
  return jsonb_build_object(
    'code', v.code, 'brand', v.brand_name, 'logo', v.brand_logo, 'ends_at', v.ends_at,
    'package', proj.package_snapshot ->> 'name', 'list_price', coalesce(pkg_line.list_price, pkg_line.amount),
    'discount', disc, 'promo', promo,
    'promo_label', (select string_agg(label, ', ') from public.invoice_lines where invoice_id = inv.id and kind = 'promo'),
    'current_total', inv.total,
    'voucher_total', others + coalesce(pkg_line.list_price, pkg_line.amount) - disc
  );
end;
$$;

-- DP mengikuti total baru: persentase lama dipertahankan, tetap minimal 80%.
create or replace function public.voucher_rescale_dp(p_dp integer, p_old integer, p_new integer) returns integer
language sql immutable as $$
  select case
    when p_dp is null or p_new <= 0 then null
    when greatest(public.dp_minimum(p_new), ceil(p_dp::numeric * p_new / nullif(p_old, 0))::integer) >= p_new then null
    else greatest(public.dp_minimum(p_new), ceil(p_dp::numeric * p_new / nullif(p_old, 0))::integer)
  end;
$$;

-- Client memasang voucher di tagihan pesanan paket. Promo paket dilepas, harga paket kembali normal,
-- lalu baris potongan voucher ditambahkan.
create or replace function public.client_apply_voucher(p_invoice uuid, p_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  q jsonb;
  inv public.invoices;
  v public.vouchers;
  pkg_line public.invoice_lines;
  promo_lines jsonb;
  new_total integer;
begin
  select * into inv from public.invoices where id = p_invoice and client_id = auth.uid() for update;
  if not found then
    raise exception 'Tagihan tidak ditemukan.' using errcode = 'P0002';
  end if;
  select * into v from public.vouchers where code = upper(btrim(coalesce(p_code, ''))) for update;
  q := public.client_voucher_quote(p_invoice, p_code);

  select * into pkg_line from public.invoice_lines where invoice_id = inv.id and kind = 'package' order by position limit 1;
  select coalesce(jsonb_agg(to_jsonb(l) - 'id' - 'invoice_id' order by l.position), '[]'::jsonb) into promo_lines
  from public.invoice_lines l where l.invoice_id = inv.id and l.kind = 'promo';

  update public.vouchers
  set invoice_id = inv.id, redeemed_at = now(), redeemed_by = auth.uid(),
      restore = jsonb_build_object('package_line', pkg_line.id, 'unit_price', pkg_line.unit_price, 'amount', pkg_line.amount, 'promo_lines', promo_lines, 'dp', inv.dp_amount)
  where id = v.id;

  delete from public.invoice_lines where invoice_id = inv.id and kind = 'promo';
  update public.invoice_lines set unit_price = coalesce(list_price, unit_price), amount = coalesce(list_price, unit_price) * quantity where id = pkg_line.id;
  insert into public.invoice_lines (invoice_id, position, kind, item_key, label, quantity, unit_price, amount, list_price)
  values (inv.id, (select coalesce(max(position), 0) + 1 from public.invoice_lines where invoice_id = inv.id), 'promo', 'voucher',
          'Voucher ' || v.code || ' · ' || v.brand_name, 1, -(q ->> 'discount')::integer, -(q ->> 'discount')::integer, null);

  select coalesce(sum(amount), 0) into new_total from public.invoice_lines where invoice_id = inv.id;
  update public.invoices set total = new_total, dp_amount = public.voucher_rescale_dp(inv.dp_amount, inv.total, new_total) where id = inv.id;

  perform public.log_activity('voucher.applied', 'invoice', inv.id::text,
    jsonb_build_object('code', v.code, 'discount', q -> 'discount', 'old_total', inv.total, 'new_total', new_total));
  return q || jsonb_build_object('new_total', new_total);
end;
$$;

-- Client melepas voucher sebelum bukti bayar diunggah: harga paket dan promo semula dipulihkan.
create or replace function public.client_remove_voucher(p_invoice uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  inv public.invoices;
  v public.vouchers;
  l jsonb;
  base integer;
  new_total integer;
begin
  select * into inv from public.invoices where id = p_invoice and client_id = auth.uid() for update;
  if not found then
    raise exception 'Tagihan tidak ditemukan.' using errcode = 'P0002';
  end if;
  if inv.status <> 'unpaid' then
    raise exception 'Voucher hanya bisa dilepas sebelum bukti bayar diunggah.' using errcode = '22023';
  end if;
  select * into v from public.vouchers where invoice_id = inv.id for update;
  if not found then
    raise exception 'Tagihan ini tidak memakai voucher.' using errcode = '22023';
  end if;

  delete from public.invoice_lines where invoice_id = inv.id and kind = 'promo' and item_key = 'voucher';
  update public.invoice_lines set unit_price = (v.restore ->> 'unit_price')::integer, amount = (v.restore ->> 'amount')::integer
  where id = (v.restore ->> 'package_line')::uuid;
  select coalesce(max(position), 0) into base from public.invoice_lines where invoice_id = inv.id;
  for l in select value from jsonb_array_elements(coalesce(v.restore -> 'promo_lines', '[]'::jsonb)) loop
    base := base + 1;
    insert into public.invoice_lines (invoice_id, position, kind, item_key, label, quantity, unit_price, amount, list_price, details)
    values (inv.id, base, 'promo', l ->> 'item_key', l ->> 'label', (l ->> 'quantity')::integer, (l ->> 'unit_price')::integer,
            (l ->> 'amount')::integer, (l ->> 'list_price')::integer, coalesce(l -> 'details', '[]'::jsonb));
  end loop;

  select coalesce(sum(amount), 0) into new_total from public.invoice_lines where invoice_id = inv.id;
  update public.invoices set total = new_total, dp_amount = public.voucher_rescale_dp(inv.dp_amount, inv.total, new_total) where id = inv.id;
  update public.vouchers set invoice_id = null, redeemed_at = null, redeemed_by = null, restore = null where id = v.id;
  perform public.log_activity('voucher.removed', 'invoice', inv.id::text, jsonb_build_object('code', v.code, 'new_total', new_total));
end;
$$;

-- Tagihan kedaluwarsa atau dibatalkan: voucher kembali bisa dipakai (selama masa berlakunya).
create or replace function public.release_voucher_on_close() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('expired', 'cancelled') and old.status is distinct from new.status then
    update public.vouchers set invoice_id = null, redeemed_at = null, redeemed_by = null, restore = null where invoice_id = new.id;
  end if;
  return new;
end;
$$;

create trigger invoices_release_voucher after update of status on public.invoices
  for each row execute function public.release_voucher_on_close();

-- ---------------------------------------------------------------------------
-- 2. Artikel
-- ---------------------------------------------------------------------------

create table public.article_categories (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 40),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  description text not null default '' check (char_length(description) <= 300),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.articles (
  id uuid primary key default gen_random_uuid(),
  category text not null references public.article_categories (slug) on update cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 100),
  title text not null check (char_length(btrim(title)) between 3 and 140),
  excerpt text not null default '' check (char_length(excerpt) <= 300),
  -- Isi artikel: "## " subjudul, "### " sub-subjudul, "- " butir, "1. " langkah, **tebal**, [teks](https://...), baris kosong = paragraf baru.
  body text not null default '' check (char_length(body) <= 60000),
  cover text not null default '' check (char_length(cover) <= 500),
  seo_title text not null default '' check (char_length(seo_title) <= 70),
  seo_description text not null default '' check (char_length(seo_description) <= 170),
  -- Tombol WhatsApp di akhir artikel (opsional): teks tombol dan pesan awal yang terisi di WA.
  cta_label text not null default '' check (char_length(cta_label) <= 60),
  cta_message text not null default '' check (char_length(cta_message) <= 500),
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  author_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category, slug),
  constraint articles_published check (status = 'draft' or published_at is not null)
);

create index articles_published_idx on public.articles (published_at desc) where status = 'published';

create trigger articles_touch before update on public.articles
  for each row execute function public.touch_updated_at();

alter table public.article_categories enable row level security;
alter table public.articles enable row level security;
create policy "kategori artikel dibaca semua" on public.article_categories for select to anon, authenticated using (true);
create policy "admin mengelola kategori artikel" on public.article_categories for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "artikel terbit dibaca semua" on public.articles for select to anon, authenticated
  using (status = 'published' and published_at <= now());
create policy "admin mengelola artikel" on public.articles for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.article_categories (slug, name, description, sort_order) values
  ('promo', 'Promo', 'Promo dan penawaran terbaru SilentCX.', 0),
  ('panduan', 'Panduan', 'Panduan memakai SilentCX, dari memesan audit sampai membaca laporan.', 1);

-- ---------------------------------------------------------------------------
-- 3. Hak akses fungsi
-- ---------------------------------------------------------------------------

revoke execute on function public.voucher_code_base(text) from public, anon;
revoke execute on function public.voucher_code_suffix() from public, anon, authenticated;
revoke execute on function public.voucher_clean_rules(jsonb) from public, anon, authenticated;
revoke execute on function public.admin_create_voucher(text, text, jsonb, timestamptz, timestamptz, text, text) from public, anon;
grant execute on function public.admin_create_voucher(text, text, jsonb, timestamptz, timestamptz, text, text) to authenticated;
revoke execute on function public.admin_update_voucher(uuid, text, text, jsonb, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.admin_update_voucher(uuid, text, text, jsonb, timestamptz, timestamptz, text) to authenticated;
revoke execute on function public.admin_cancel_voucher(uuid) from public, anon;
grant execute on function public.admin_cancel_voucher(uuid) to authenticated;
revoke execute on function public.voucher_state(public.vouchers) from public, anon;
grant execute on function public.voucher_state(public.vouchers) to authenticated;
revoke execute on function public.voucher_rules_view(jsonb) from public;
grant execute on function public.voucher_rules_view(jsonb) to anon, authenticated;
revoke execute on function public.voucher_card(text) from public;
grant execute on function public.voucher_card(text) to anon, authenticated;
revoke execute on function public.client_voucher_quote(uuid, text) from public, anon;
grant execute on function public.client_voucher_quote(uuid, text) to authenticated;
revoke execute on function public.client_apply_voucher(uuid, text) from public, anon;
grant execute on function public.client_apply_voucher(uuid, text) to authenticated;
revoke execute on function public.client_remove_voucher(uuid) from public, anon;
grant execute on function public.client_remove_voucher(uuid) to authenticated;
revoke execute on function public.release_voucher_on_close() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Artikel promo launching (terbit otomatis 5 Nov 2026 00.00 WIB; bisa diubah admin di menu Artikel)
-- ---------------------------------------------------------------------------

insert into public.articles (category, slug, title, excerpt, seo_title, seo_description, cta_label, cta_message, status, published_at, body) values
('promo', 'promo-launching-silentcx',
 'Promo Launching SilentCX: Hemat 50% Audit Mystery Shopping untuk Brand Anda',
 'Rayakan peluncuran SilentCX dengan voucher khusus brand: hemat 50% paket Essential dan Insight, serta hemat Rp999.000 paket Performance. Berlaku 5 November sampai 5 Desember 2026.',
 'Promo Launching SilentCX: Hemat 50% Mystery Shopping',
 'Voucher khusus brand: hemat 50% paket Essential & Insight, hemat Rp999.000 paket Performance. Berlaku 5 Nov–5 Des 2026.',
 'Minta voucher via WhatsApp',
 'Halo SilentCX, saya ingin minta voucher Promo Launching untuk brand saya. Nama brand: ',
 'published', '2026-11-05 00:00:00+07',
$body$Bagaimana pengalaman pelanggan di outlet Anda saat Anda tidak ada di sana? Sapaan kasir, kecepatan pelayanan, kebersihan meja, sampai cara tim menawarkan menu tambahan: semuanya membentuk keputusan pelanggan untuk kembali atau tidak.

Untuk merayakan peluncuran SilentCX, kami membuka **Promo Launching** dengan voucher khusus untuk setiap brand. Ini kesempatan memotret pengalaman pelanggan Anda yang sebenarnya, dengan biaya jauh lebih ringan.

## Isi promonya

- **SilentCX Essential: hemat 50%.** Dari Rp1.099.000 menjadi Rp549.500 untuk 1 outlet.
- **SilentCX Insight: hemat 50%.** Dari Rp1.399.000 menjadi Rp699.500 untuk 1 outlet.
- **SilentCX Performance: hemat Rp999.000.** Untuk 3 outlet, dari Rp3.999.000 menjadi Rp3.000.000.

Promo berlaku **5 November sampai 5 Desember 2026**.

## Voucher khusus untuk brand Anda

Promo ini tidak memakai kode umum. Setiap brand mendapat **satu voucher personal** dengan nama dan logo brand, misalnya kode KOPISENJA-7K2Q untuk Kopi Senja. Voucher berlaku sekali pakai, jadi potongannya benar-benar untuk brand Anda.

## Paket mana yang cocok?

### Essential
Untuk brand yang ingin mulai dari potret dasar: sekitar 30 indikator audit, mulai dari sapaan, pengetahuan produk, ketepatan pesanan, kecepatan, kebersihan, sampai upselling. Hasilnya skor CX, 3–5 temuan utama, dan rekomendasi cepat.

### Insight
Paket paling populer untuk diagnosis mendalam: sekitar 50–70 indikator, pemeriksaan kepatuhan SOP, bukti foto, tingkat keparahan temuan, analisis gap, dan konsultasi 30 menit bersama tim SilentCX.

### Performance
Untuk brand dengan beberapa cabang: audit 3–5 outlet sekaligus, peringkat antar outlet, benchmark CX, identifikasi red flag, ringkasan eksekutif, dan konsultasi 60 menit.

## Kenapa mystery shopping?

1. Anda melihat pengalaman pelanggan apa adanya, bukan saat tim sedang diawasi.
2. Temuan disertai bukti, jadi perbaikan bisa langsung diarahkan ke titik yang tepat.
3. Laporan memberi prioritas: mana yang harus dibereskan minggu ini, mana yang bisa menyusul.

## Cara mendapatkan voucher

Klik tombol WhatsApp di bawah dan sebutkan nama brand Anda. Tim kami mengirimkan voucher berisi kode, nama, dan logo brand Anda. Setelah itu ikuti [panduan klaim voucher](/artikel/promo/cara-klaim-voucher-silentcx).

Sebelum memakai voucher, baca juga [syarat dan ketentuan promo](/artikel/promo/syarat-ketentuan-promo-launching).$body$),

('promo', 'syarat-ketentuan-promo-launching',
 'Syarat & Ketentuan Promo Launching SilentCX',
 'Ketentuan lengkap voucher Promo Launching SilentCX: masa berlaku, paket yang termasuk, besar potongan, dan aturan pemakaian voucher.',
 'Syarat & Ketentuan Promo Launching SilentCX',
 'Masa berlaku, paket, besar potongan, dan aturan pemakaian voucher Promo Launching SilentCX 5 Nov–5 Des 2026.',
 'Tanya promo via WhatsApp',
 'Halo SilentCX, saya ingin bertanya tentang syarat dan ketentuan Promo Launching.',
 'published', '2026-11-05 00:00:00+07',
$body$Syarat dan ketentuan berikut berlaku untuk voucher Promo Launching SilentCX.

## Masa berlaku

- Voucher berlaku mulai **5 November 2026 pukul 00.00 WIB** sampai **5 Desember 2026 pukul 23.59 WIB**.
- Voucher harus dipasang di tagihan sebelum masa berlakunya berakhir. Voucher yang sudah terpasang tetap berlaku walaupun tagihan dibayar setelah tanggal tersebut, selama tagihan belum kedaluwarsa.

## Besar potongan

- **SilentCX Essential:** potongan 50% dari harga paket.
- **SilentCX Insight:** potongan 50% dari harga paket.
- **SilentCX Performance:** potongan Rp999.000 dari harga paket.
- Potongan berlaku untuk harga paket saja. Add-on, biaya tugas luar kota, dan kelebihan biaya pembelian shopper tidak termasuk potongan voucher.

## Aturan voucher

- Satu voucher khusus untuk satu brand dan hanya bisa dipakai **satu kali**.
- Voucher dikirim langsung oleh tim SilentCX. Kode voucher tidak untuk diperjualbelikan.
- Voucher **tidak bisa digabung** dengan promo paket lain. Kalau paket sedang promo, Anda bisa memilih: tetap memakai promo atau melepas promo dan memakai voucher. Halaman Tagihan menampilkan perbandingan totalnya.
- Promo add-on (kalau ada) tetap berlaku bersama voucher.
- Voucher bisa dilepas selama bukti bayar belum diunggah. Setelah bukti bayar diunggah, voucher terkunci di tagihan tersebut.
- Kalau tagihan kedaluwarsa atau dibatalkan, voucher kembali bisa dipakai selama masa berlakunya belum lewat.
- Pembayaran DP tetap bisa dipilih. DP minimal 80% dihitung dari total setelah potongan voucher.
- Voucher tidak bisa ditukar dengan uang tunai.

## Lain-lain

- SilentCX berhak membatalkan voucher yang disalahgunakan.
- Ketentuan layanan lainnya mengikuti [Syarat & Ketentuan SilentCX](/syarat).

Ada pertanyaan? Hubungi kami lewat tombol WhatsApp di bawah.$body$),

('promo', 'cara-klaim-voucher-silentcx',
 'Cara Klaim Voucher SilentCX di Halaman Tagihan',
 'Panduan langkah demi langkah memakai voucher SilentCX: dari membuka tautan voucher, memesan paket, sampai potongan muncul di tagihan.',
 'Cara Klaim Voucher SilentCX: Panduan Lengkap',
 'Langkah memakai voucher SilentCX: buka tautan voucher, pesan paket, masukkan kode di Tagihan, lalu bayar total baru.',
 'Minta voucher via WhatsApp',
 'Halo SilentCX, saya ingin minta voucher untuk brand saya. Nama brand: ',
 'published', '2026-11-05 00:00:00+07',
$body$Voucher SilentCX dipakai di halaman **Tagihan**, setelah Anda memesan paket dan sebelum membayar. Berikut langkahnya.

## Langkah klaim

1. **Buka tautan voucher** yang dikirim tim SilentCX, misalnya silentcx.com/voucher/KOPISENJA-7K2Q. Di sana terlihat nama dan logo brand Anda, besar potongan, dan masa berlakunya.
2. **Klik Daftar & pakai voucher** (atau Masuk kalau sudah punya akun). Kode voucher tersimpan otomatis di browser Anda.
3. **Pilih paket** di menu Paket & add-on, isi kota outlet, lalu kirim pesanan.
4. **Buka menu Tagihan.** Kolom kode voucher sudah terisi. Klik **Cek voucher** untuk melihat potongannya.
5. **Klik Pakai voucher.** Total tagihan langsung diperbarui dan potongan voucher tampil sebagai baris tersendiri di invoice.
6. **Pilih cara bayar** (bayar penuh atau DP minimal 80%), transfer sesuai total baru, lalu unggah bukti bayar.

## Kalau paket sedang promo

Voucher tidak bisa digabung dengan promo paket. Saat Anda mengecek voucher, halaman Tagihan menampilkan dua total berdampingan: **dengan promo sekarang** dan **dengan voucher**. Pilih yang paling menguntungkan:

- **Lepas promo & pakai voucher** untuk memakai potongan voucher.
- **Tetap pakai promo** kalau promo yang sedang berjalan lebih hemat.

## Ingin membatalkan voucher?

Klik **Lepas voucher** di halaman Tagihan selama bukti bayar belum diunggah. Harga dan promo semula kembali seperti sebelumnya, dan voucher bisa dipasang lagi nanti selama masih berlaku.

## Pesan yang mungkin muncul

- **Kode tidak ditemukan:** periksa lagi penulisan kode. Huruf besar atau kecil tidak berpengaruh.
- **Berlaku untuk paket lain:** voucher hanya untuk paket yang tertulis di voucher.
- **Sudah dipakai:** setiap voucher hanya bisa dipakai satu kali.
- **Sudah berakhir:** masa berlaku voucher sudah lewat.

Belum punya voucher? Minta lewat tombol WhatsApp di bawah dan sebutkan nama brand Anda. Ketentuan lengkap ada di [syarat & ketentuan promo](/artikel/promo/syarat-ketentuan-promo-launching).$body$);
