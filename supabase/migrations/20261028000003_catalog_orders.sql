-- Fase 1: katalog (paket, harga per jumlah outlet, add-on, promo, kota dilayani, pengaturan pembayaran),
-- pesanan client, invoice, bukti bayar, verifikasi admin, dan data perusahaan/outlet.
--
-- Semua angka uang dalam rupiah (integer) dan sudah termasuk PPN.
-- Harga dihitung ulang di database (quote_order); angka dari browser tidak pernah dipakai.
-- Status pesanan dan invoice hanya berpindah lewat fungsi di bawah, bukan update langsung dari browser.

create type public.project_status as enum (
  'awaiting_review',   -- perlu konfirmasi admin dulu (add-on tanpa harga pasti, kota di luar jangkauan, add-on khusus)
  'awaiting_payment',  -- invoice bisa dibayar
  'verifying',         -- bukti bayar sedang diperiksa admin
  'active',            -- pembayaran diverifikasi, dashboard client aktif
  'reporting',
  'completed',
  'cancelled',
  'expired'
);

create type public.invoice_status as enum ('draft', 'unpaid', 'verifying', 'paid', 'expired', 'cancelled');

-- ---------------------------------------------------------------------------
-- Nomor dokumen: PRJ-0001, INV-0001
-- ---------------------------------------------------------------------------

create table public.id_counters (
  prefix text primary key,
  value integer not null default 0
);

create or replace function public.next_code(p_prefix text) returns text
language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  insert into public.id_counters (prefix, value) values (p_prefix, 1)
  on conflict (prefix) do update set value = public.id_counters.value + 1
  returning value into n;
  return p_prefix || '-' || lpad(n::text, 4, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- Katalog
-- ---------------------------------------------------------------------------

create table public.packages (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9_]{2,40}$'),
  name text not null check (char_length(name) between 1 and 80),
  name_en text,
  tagline text not null default '' check (char_length(tagline) <= 200),
  tagline_en text,
  indicators text not null default '' check (char_length(indicators) <= 80),
  features text[] not null default '{}',
  features_en text[],
  visits integer not null default 1 check (visits between 1 and 20),
  purchase_allowance integer not null default 0 check (purchase_allowance >= 0),
  -- Fitur dashboard/laporan yang dibuka paket ini.
  entitlements text[] not null default '{}',
  recommended boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  promo_pct integer check (promo_pct between 1 and 90),
  promo_starts_at timestamptz,
  promo_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint packages_promo_dates check (
    promo_pct is null or (promo_starts_at is not null and promo_ends_at is not null and promo_ends_at > promo_starts_at)
  )
);

create trigger packages_touch before update on public.packages
  for each row execute function public.touch_updated_at();

-- Harga paket per jumlah outlet. Paket 1 outlet punya satu baris; Performance punya baris 3, 4, 5.
create table public.package_prices (
  package_id uuid not null references public.packages (id) on delete cascade,
  outlets integer not null check (outlets between 1 and 50),
  price integer not null check (price >= 0),
  primary key (package_id, outlets)
);

create table public.addons (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9_]{2,40}$'),
  name text not null check (char_length(name) between 1 and 80),
  name_en text,
  description text not null default '' check (char_length(description) <= 300),
  description_en text,
  unit text not null default '' check (char_length(unit) <= 40),
  unit_en text,
  -- fixed: harga pasti, langsung masuk total. quote: harga dikonfirmasi admin sebelum invoice bisa dibayar;
  -- price untuk quote adalah perkiraan "mulai dari" (0 = belum ada perkiraan).
  pricing text not null default 'fixed' check (pricing in ('fixed', 'quote')),
  price integer not null default 0 check (price >= 0),
  max_qty integer not null default 1 check (max_qty between 1 and 20),
  -- Menambah jumlah outlet yang diaudit (misalnya "Outlet tambahan").
  adds_outlets boolean not null default false,
  -- Harga pasti, tapi tetap perlu persetujuan admin sebelum dibayar.
  requires_review boolean not null default false,
  entitlement text check (entitlement is null or entitlement ~ '^[a-z0-9_]+$'),
  -- Paket yang boleh memakai add-on ini; kosong = semua paket.
  applicable_packages text[] not null default '{}',
  active boolean not null default true,
  sort_order integer not null default 0,
  promo_pct integer check (promo_pct between 1 and 90),
  promo_starts_at timestamptz,
  promo_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint addons_promo_dates check (
    promo_pct is null or (promo_starts_at is not null and promo_ends_at is not null and promo_ends_at > promo_starts_at)
  )
);

create trigger addons_touch before update on public.addons
  for each row execute function public.touch_updated_at();

create table public.service_cities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index service_cities_name_idx on public.service_cities (lower(btrim(name)));

-- Pengaturan aplikasi. Kunci 'payment': { bank_name, account_number, account_holder, qris_url }.
create table public.app_settings (
  key text primary key check (key ~ '^[a-z0-9_]+$'),
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create trigger app_settings_touch before update on public.app_settings
  for each row execute function public.touch_updated_at();

-- Harga setelah promo yang sedang berlaku.
create or replace function public.promo_price(p_price integer, p_pct integer, p_starts timestamptz, p_ends timestamptz)
returns integer
language sql stable as $$
  select case
    when p_pct is not null and now() >= p_starts and now() < p_ends then round(p_price * (100 - p_pct) / 100.0)::integer
    else p_price
  end;
$$;

-- ---------------------------------------------------------------------------
-- Data client
-- ---------------------------------------------------------------------------

create table public.companies (
  client_id uuid primary key references public.profiles (id) on delete cascade,
  name text not null default '' check (char_length(name) <= 120),
  industry text not null default '' check (char_length(industry) <= 80),
  address text not null default '' check (char_length(address) <= 300),
  city text not null default '' check (char_length(city) <= 80),
  instagram text not null default '' check (char_length(instagram) <= 80),
  pic_name text not null default '' check (char_length(pic_name) <= 120),
  pic_position text not null default '' check (char_length(pic_position) <= 80),
  pic_phone text not null default '' check (pic_phone = '' or pic_phone ~ '^\+?[0-9]{8,15}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger companies_touch before update on public.companies
  for each row execute function public.touch_updated_at();

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  client_id uuid not null references public.profiles (id) on delete cascade,
  package_id uuid references public.packages (id) on delete set null,
  -- Salinan paket dan add-on saat dipesan; perubahan katalog sesudahnya tidak mengubah pesanan.
  package_snapshot jsonb not null,
  addons_snapshot jsonb not null default '[]'::jsonb,
  outlet_count integer not null check (outlet_count between 1 and 100),
  entitlements text[] not null default '{}',
  status public.project_status not null,
  review_reasons text[] not null default '{}',
  status_note text check (status_note is null or char_length(status_note) <= 500),
  objectives text not null default '' check (char_length(objectives) <= 2000),
  details_completed_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_client_idx on public.projects (client_id, created_at desc);
create index projects_status_idx on public.projects (status);

create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

create table public.project_outlets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  position integer not null check (position >= 1),
  city text not null check (char_length(city) between 1 and 80),
  name text not null default '' check (char_length(name) <= 120),
  address text not null default '' check (char_length(address) <= 300),
  maps_url text not null default '' check (maps_url = '' or maps_url ~ '^https://'),
  notes text not null default '' check (char_length(notes) <= 500),
  unique (project_id, position)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  project_id uuid not null unique references public.projects (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  status public.invoice_status not null,
  total integer not null default 0 check (total >= 0),
  due_at timestamptz,
  paid_at timestamptz,
  status_note text check (status_note is null or char_length(status_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invoices_status_idx on public.invoices (status);

create trigger invoices_touch before update on public.invoices
  for each row execute function public.touch_updated_at();

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  position integer not null,
  kind text not null check (kind in ('package', 'addon')),
  item_key text not null,
  label text not null,
  quantity integer not null default 1 check (quantity >= 1),
  -- null = menunggu harga dari admin (add-on quote).
  unit_price integer check (unit_price >= 0),
  amount integer check (amount >= 0),
  -- Harga normal sebelum promo, untuk ditampilkan dicoret.
  list_price integer check (list_price >= 0),
  unique (invoice_id, position)
);

create table public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  method text not null check (method in ('transfer', 'qris')),
  file_path text not null,
  payer_name text not null default '' check (char_length(payer_name) <= 120),
  amount integer not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  review_note text check (review_note is null or char_length(review_note) <= 500),
  uploaded_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null
);

create index payment_proofs_invoice_idx on public.payment_proofs (invoice_id, uploaded_at desc);

-- ---------------------------------------------------------------------------
-- Harga pesanan
-- ---------------------------------------------------------------------------

-- Menghitung pesanan dari katalog yang aktif.
-- p_cities: satu kota per outlet. p_addons: [{ "key": "...", "qty": 1 }].
-- Jumlah outlet = outlet paket + jumlah add-on yang menambah outlet.
create or replace function public.quote_order(p_package text, p_cities text[], p_addons jsonb default '[]'::jsonb)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  pkg public.packages;
  a public.addons;
  item jsonb;
  qty integer;
  seen text[] := '{}';
  outlet_total integer := coalesce(array_length(p_cities, 1), 0);
  extra_outlets integer := 0;
  base_outlets integer;
  base_price integer;
  unit integer;
  lines jsonb := '[]'::jsonb;
  addon_lines jsonb := '[]'::jsonb;
  total integer := 0;
  reasons text[] := '{}';
  unserved text[];
  ents text[];
  c text;
begin
  select * into pkg from public.packages where key = p_package and active;
  if not found then
    raise exception 'Paket tidak tersedia.' using errcode = '22023';
  end if;
  ents := pkg.entitlements;

  if p_cities is null or cardinality(p_cities) = 0 then
    raise exception 'Isi kota untuk setiap outlet.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_addons, '[]'::jsonb)) <> 'array' then
    raise exception 'Data add-on tidak valid.' using errcode = '22023';
  end if;

  for item in select * from jsonb_array_elements(coalesce(p_addons, '[]'::jsonb)) loop
    select * into a from public.addons where key = item ->> 'key' and active;
    if not found then
      raise exception 'Add-on tidak tersedia.' using errcode = '22023';
    end if;
    if a.key = any(seen) then
      raise exception 'Add-on % dipilih lebih dari sekali.', a.name using errcode = '22023';
    end if;
    seen := seen || a.key;
    if cardinality(a.applicable_packages) > 0 and not (pkg.key = any(a.applicable_packages)) then
      raise exception 'Add-on % tidak tersedia untuk paket %.', a.name, pkg.name using errcode = '22023';
    end if;
    qty := coalesce((item ->> 'qty')::integer, 1);
    if qty < 1 or qty > a.max_qty then
      raise exception 'Jumlah % harus 1 sampai %.', a.name, a.max_qty using errcode = '22023';
    end if;
    if a.adds_outlets then
      extra_outlets := extra_outlets + qty;
    end if;
    if a.pricing = 'quote' then
      reasons := array_append(reasons, 'quote');
      addon_lines := addon_lines || jsonb_build_object(
        'kind', 'addon', 'item_key', a.key, 'label', a.name, 'quantity', qty,
        'unit_price', null, 'amount', null, 'list_price', null, 'estimate', nullif(a.price, 0));
    else
      unit := public.promo_price(a.price, a.promo_pct, a.promo_starts_at, a.promo_ends_at);
      total := total + unit * qty;
      addon_lines := addon_lines || jsonb_build_object(
        'kind', 'addon', 'item_key', a.key, 'label', a.name, 'quantity', qty,
        'unit_price', unit, 'amount', unit * qty, 'list_price', a.price, 'estimate', null);
    end if;
    if a.requires_review then
      reasons := array_append(reasons, 'addon');
    end if;
    if a.entitlement is not null then
      ents := array_append(ents, a.entitlement);
    end if;
  end loop;

  base_outlets := outlet_total - extra_outlets;
  select price into base_price from public.package_prices where package_id = pkg.id and outlets = base_outlets;
  if not found then
    raise exception 'Paket % tidak tersedia untuk % outlet.', pkg.name, base_outlets using errcode = '22023';
  end if;

  foreach c in array p_cities loop
    if c is null or char_length(btrim(c)) not between 2 and 80 then
      raise exception 'Kota setiap outlet wajib diisi.' using errcode = '22023';
    end if;
  end loop;

  unit := public.promo_price(base_price, pkg.promo_pct, pkg.promo_starts_at, pkg.promo_ends_at);
  total := total + unit;
  lines := jsonb_build_array(jsonb_build_object(
    'kind', 'package', 'item_key', pkg.key, 'label', pkg.name || ' (' || base_outlets || ' outlet)', 'quantity', 1,
    'unit_price', unit, 'amount', unit, 'list_price', base_price, 'estimate', null)) || addon_lines;

  select coalesce(array_agg(distinct btrim(x)), '{}') into unserved
  from unnest(p_cities) as x
  where not exists (select 1 from public.service_cities s where s.active and lower(btrim(s.name)) = lower(btrim(x)));
  if cardinality(unserved) > 0 then
    reasons := array_append(reasons, 'city');
  end if;

  select coalesce(array_agg(distinct r order by r), '{}') into reasons from unnest(reasons) as r;
  select coalesce(array_agg(distinct e order by e), '{}') into ents from unnest(ents) as e;

  return jsonb_build_object(
    'package', jsonb_build_object(
      'id', pkg.id, 'key', pkg.key, 'name', pkg.name, 'outlets', base_outlets, 'visits', pkg.visits,
      'purchase_allowance', pkg.purchase_allowance, 'price', unit, 'list_price', base_price),
    'outlet_count', outlet_total,
    'cities', to_jsonb(p_cities),
    'lines', lines,
    'total', total,
    'review_reasons', to_jsonb(reasons),
    'unserved_cities', to_jsonb(unserved),
    'entitlements', to_jsonb(ents)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Pesanan dan invoice
-- ---------------------------------------------------------------------------

-- Invoice yang lewat batas bayar menjadi kedaluwarsa, begitu juga pesanannya. Aman dipanggil kapan saja.
create or replace function public.expire_overdue() returns integer
language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  with expired as (
    update public.invoices set status = 'expired'
    where status = 'unpaid' and due_at < now()
    returning project_id
  )
  update public.projects p set status = 'expired'
  from expired e
  where p.id = e.project_id and p.status = 'awaiting_payment';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Client membuat pesanan. Satu client hanya boleh punya satu pesanan yang belum selesai dibayar.
create or replace function public.create_order(p_package text, p_cities text[], p_addons jsonb default '[]'::jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  q jsonb;
  v_project uuid;
  v_invoice uuid;
  needs_review boolean;
  line jsonb;
  i integer := 0;
  c text;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'client' and status = 'active') then
    raise exception 'Hanya pemilik bisnis yang bisa memesan paket.' using errcode = '42501';
  end if;

  perform public.expire_overdue();
  if exists (
    select 1 from public.projects
    where client_id = auth.uid() and status in ('awaiting_review', 'awaiting_payment', 'verifying')
  ) then
    raise exception 'Masih ada pesanan yang belum selesai. Selesaikan atau tunggu pesanan itu dulu.' using errcode = '22023';
  end if;

  q := public.quote_order(p_package, p_cities, p_addons);
  needs_review := jsonb_array_length(q -> 'review_reasons') > 0;

  insert into public.projects (code, client_id, package_id, package_snapshot, addons_snapshot, outlet_count, entitlements, status, review_reasons)
  values (
    public.next_code('PRJ'), auth.uid(), (q -> 'package' ->> 'id')::uuid, q -> 'package',
    coalesce((select jsonb_agg(l) from jsonb_array_elements(q -> 'lines') l where l ->> 'kind' = 'addon'), '[]'::jsonb),
    (q ->> 'outlet_count')::integer,
    array(select jsonb_array_elements_text(q -> 'entitlements')),
    (case when needs_review then 'awaiting_review' else 'awaiting_payment' end)::public.project_status,
    array(select jsonb_array_elements_text(q -> 'review_reasons'))
  )
  returning id into v_project;

  foreach c in array p_cities loop
    i := i + 1;
    insert into public.project_outlets (project_id, position, city) values (v_project, i, btrim(c));
  end loop;

  insert into public.invoices (code, project_id, client_id, status, total, due_at)
  values (
    public.next_code('INV'), v_project, auth.uid(),
    (case when needs_review then 'draft' else 'unpaid' end)::public.invoice_status,
    (q ->> 'total')::integer,
    case when needs_review then null else now() + interval '48 hours' end
  )
  returning id into v_invoice;

  i := 0;
  for line in select * from jsonb_array_elements(q -> 'lines') loop
    i := i + 1;
    insert into public.invoice_lines (invoice_id, position, kind, item_key, label, quantity, unit_price, amount, list_price)
    values (v_invoice, i, line ->> 'kind', line ->> 'item_key', line ->> 'label', (line ->> 'quantity')::integer,
            (line ->> 'unit_price')::integer, (line ->> 'amount')::integer, (line ->> 'list_price')::integer);
  end loop;

  perform public.log_activity('order.created', 'project', v_project::text,
    jsonb_build_object('total', q -> 'total', 'review_reasons', q -> 'review_reasons'));
  return v_project;
end;
$$;

-- Client mengirim bukti bayar. File sudah diunggah server ke folder milik client dan invoice ini.
create or replace function public.submit_payment_proof(p_invoice uuid, p_method text, p_path text, p_amount integer, p_payer text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  inv public.invoices;
begin
  perform public.expire_overdue();
  select * into inv from public.invoices where id = p_invoice and client_id = auth.uid() for update;
  if not found then
    raise exception 'Invoice tidak ditemukan.' using errcode = 'P0002';
  end if;
  if inv.status = 'expired' then
    raise exception 'Invoice sudah kedaluwarsa. Silakan buat pesanan baru.' using errcode = '22023';
  end if;
  if inv.status <> 'unpaid' then
    raise exception 'Invoice ini tidak sedang menunggu pembayaran.' using errcode = '22023';
  end if;
  if p_method not in ('transfer', 'qris') then
    raise exception 'Metode pembayaran tidak valid.' using errcode = '22023';
  end if;
  if p_path is null or p_path not like auth.uid()::text || '/' || p_invoice::text || '/%' then
    raise exception 'File bukti tidak valid.' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Nominal yang dibayar wajib diisi.' using errcode = '22023';
  end if;

  insert into public.payment_proofs (invoice_id, method, file_path, payer_name, amount)
  values (p_invoice, p_method, p_path, left(btrim(coalesce(p_payer, '')), 120), p_amount);
  update public.invoices set status = 'verifying', status_note = null where id = p_invoice;
  update public.projects set status = 'verifying', status_note = null where id = inv.project_id;

  perform public.log_activity('payment.submitted', 'invoice', p_invoice::text,
    jsonb_build_object('method', p_method, 'amount', p_amount, 'total', inv.total));
end;
$$;

-- Admin meninjau pesanan yang perlu konfirmasi: mengisi harga add-on quote lalu menyetujui,
-- atau membatalkan dengan alasan. p_prices: { "<id baris invoice>": <harga satuan> }.
create or replace function public.admin_review_order(p_project uuid, p_approve boolean, p_note text default null, p_prices jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  proj public.projects;
  inv public.invoices;
  ln public.invoice_lines;
  price integer;
  note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa meninjau pesanan.' using errcode = '42501';
  end if;
  select * into proj from public.projects where id = p_project for update;
  if not found then
    raise exception 'Pesanan tidak ditemukan.' using errcode = 'P0002';
  end if;
  if proj.status <> 'awaiting_review' then
    raise exception 'Pesanan ini tidak sedang menunggu tinjauan.' using errcode = '22023';
  end if;
  select * into inv from public.invoices where project_id = p_project for update;

  if not p_approve then
    if note is null then
      raise exception 'Alasan wajib diisi.' using errcode = '22023';
    end if;
    update public.projects set status = 'cancelled', status_note = left(note, 500) where id = p_project;
    update public.invoices set status = 'cancelled', status_note = left(note, 500) where id = inv.id;
    perform public.log_activity('order.cancelled', 'project', p_project::text, jsonb_build_object('note', note, 'stage', 'review'));
    return;
  end if;

  for ln in select * from public.invoice_lines where invoice_id = inv.id and amount is null loop
    price := (p_prices ->> ln.id::text)::integer;
    if price is null or price < 0 then
      raise exception 'Harga untuk % wajib diisi.', ln.label using errcode = '22023';
    end if;
    update public.invoice_lines set unit_price = price, amount = price * ln.quantity, list_price = price where id = ln.id;
  end loop;

  update public.invoices
  set status = 'unpaid', due_at = now() + interval '48 hours', status_note = note,
      total = (select coalesce(sum(amount), 0) from public.invoice_lines where invoice_id = inv.id)
  where id = inv.id;
  update public.projects set status = 'awaiting_payment', status_note = note where id = p_project;

  perform public.log_activity('order.reviewed', 'project', p_project::text, jsonb_build_object('prices', p_prices, 'note', note));
end;
$$;

-- Admin memeriksa bukti bayar: menyetujui (proyek aktif) atau menolak dengan alasan (client bisa mengirim ulang).
create or replace function public.admin_verify_payment(p_invoice uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  inv public.invoices;
  proof public.payment_proofs;
  note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa memverifikasi pembayaran.' using errcode = '42501';
  end if;
  select * into inv from public.invoices where id = p_invoice for update;
  if not found then
    raise exception 'Invoice tidak ditemukan.' using errcode = 'P0002';
  end if;
  if inv.status <> 'verifying' then
    raise exception 'Invoice ini tidak sedang menunggu verifikasi.' using errcode = '22023';
  end if;
  select * into proof from public.payment_proofs
  where invoice_id = p_invoice and status = 'pending' order by uploaded_at desc limit 1 for update;

  if p_approve then
    update public.payment_proofs set status = 'accepted', review_note = note, reviewed_at = now(), reviewed_by = auth.uid() where id = proof.id;
    update public.invoices set status = 'paid', paid_at = now(), status_note = note where id = p_invoice;
    update public.projects set status = 'active', activated_at = now(), status_note = note where id = inv.project_id;
    perform public.log_activity('payment.verified', 'invoice', p_invoice::text, jsonb_build_object('proof', proof.id, 'note', note));
  else
    if note is null then
      raise exception 'Alasan wajib diisi.' using errcode = '22023';
    end if;
    update public.payment_proofs set status = 'rejected', review_note = left(note, 500), reviewed_at = now(), reviewed_by = auth.uid() where id = proof.id;
    update public.invoices set status = 'unpaid', due_at = now() + interval '48 hours', status_note = left(note, 500) where id = p_invoice;
    update public.projects set status = 'awaiting_payment', status_note = left(note, 500) where id = inv.project_id;
    perform public.log_activity('payment.rejected', 'invoice', p_invoice::text, jsonb_build_object('proof', proof.id, 'note', note));
  end if;
end;
$$;

-- Admin membatalkan pesanan yang belum aktif (misalnya kota belum terjangkau).
create or replace function public.admin_cancel_order(p_project uuid, p_note text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  proj public.projects;
  note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa membatalkan pesanan.' using errcode = '42501';
  end if;
  if note is null then
    raise exception 'Alasan wajib diisi.' using errcode = '22023';
  end if;
  select * into proj from public.projects where id = p_project for update;
  if not found or proj.status not in ('awaiting_review', 'awaiting_payment', 'verifying') then
    raise exception 'Pesanan ini tidak bisa dibatalkan.' using errcode = '22023';
  end if;
  update public.projects set status = 'cancelled', status_note = left(note, 500) where id = p_project;
  update public.invoices set status = 'cancelled', status_note = left(note, 500) where project_id = p_project;
  perform public.log_activity('order.cancelled', 'project', p_project::text, jsonb_build_object('note', note, 'from', proj.status));
end;
$$;

-- Client menandai data outlet dan perusahaan lengkap. Setelah ini admin bisa menjadwalkan kunjungan.
create or replace function public.complete_project_details(p_project uuid, p_objectives text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  proj public.projects;
  comp public.companies;
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
    raise exception 'Lengkapi nama dan alamat setiap outlet.' using errcode = '22023';
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
-- Hak akses
-- ---------------------------------------------------------------------------

alter table public.id_counters enable row level security;
alter table public.packages enable row level security;
alter table public.package_prices enable row level security;
alter table public.addons enable row level security;
alter table public.service_cities enable row level security;
alter table public.app_settings enable row level security;
alter table public.companies enable row level security;
alter table public.projects enable row level security;
alter table public.project_outlets enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.payment_proofs enable row level security;

revoke all on public.id_counters from anon, authenticated;

-- Katalog: siapa pun melihat yang aktif; admin mengelola semuanya.
create policy "katalog aktif terbuka" on public.packages for select to anon, authenticated using (active);
create policy "admin mengelola paket" on public.packages for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "harga paket aktif terbuka" on public.package_prices for select to anon, authenticated
  using (exists (select 1 from public.packages p where p.id = package_id and p.active));
create policy "admin mengelola harga" on public.package_prices for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "add-on aktif terbuka" on public.addons for select to anon, authenticated using (active);
create policy "admin mengelola add-on" on public.addons for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "kota aktif terbuka" on public.service_cities for select to anon, authenticated using (active);
create policy "admin mengelola kota" on public.service_cities for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke insert, update, delete on public.packages, public.package_prices, public.addons, public.service_cities from anon;

-- Pengaturan pembayaran dibaca pengguna yang login (untuk instruksi bayar), diubah admin.
create policy "pengaturan dibaca pengguna" on public.app_settings for select to authenticated using (true);
create policy "admin mengelola pengaturan" on public.app_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.app_settings from anon;

-- Perusahaan: client mengelola miliknya, admin membaca semua.
create policy "client membaca perusahaannya" on public.companies for select to authenticated using (client_id = auth.uid() or public.is_admin());
create policy "client membuat perusahaannya" on public.companies for insert to authenticated
  with check (client_id = auth.uid() and public.my_role() = 'client');
create policy "client mengubah perusahaannya" on public.companies for update to authenticated
  using (client_id = auth.uid()) with check (client_id = auth.uid());
revoke all on public.companies from anon;
revoke delete on public.companies from authenticated;
revoke update on public.companies from authenticated;
grant update (name, industry, address, city, instagram, pic_name, pic_position, pic_phone) on public.companies to authenticated;

-- Pesanan, invoice, bukti: client membaca miliknya, admin membaca semua. Perubahan hanya lewat fungsi.
create policy "client membaca proyeknya" on public.projects for select to authenticated using (client_id = auth.uid() or public.is_admin());
create policy "client membaca outletnya" on public.project_outlets for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and (p.client_id = auth.uid() or public.is_admin())));
-- Nama, alamat, link maps, dan catatan outlet diisi client setelah proyek aktif. Kota tidak bisa diubah.
create policy "client mengisi data outlet" on public.project_outlets for update to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.client_id = auth.uid() and p.status = 'active'))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.client_id = auth.uid() and p.status = 'active'));
create policy "client membaca invoicenya" on public.invoices for select to authenticated using (client_id = auth.uid() or public.is_admin());
create policy "client membaca baris invoice" on public.invoice_lines for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id and (i.client_id = auth.uid() or public.is_admin())));
create policy "client membaca bukti bayarnya" on public.payment_proofs for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id and (i.client_id = auth.uid() or public.is_admin())));

revoke all on public.projects, public.project_outlets, public.invoices, public.invoice_lines, public.payment_proofs from anon;
revoke insert, update, delete on public.projects, public.invoices, public.invoice_lines, public.payment_proofs from authenticated;
revoke insert, update, delete on public.project_outlets from authenticated;
grant update (name, address, maps_url, notes) on public.project_outlets to authenticated;

-- Fungsi: yang dipakai dari aplikasi bisa dipanggil pengguna login (pemeriksaan ada di dalam fungsi).
revoke execute on function public.next_code(text) from public, anon, authenticated;
revoke execute on function public.quote_order(text, text[], jsonb) from public;
grant execute on function public.quote_order(text, text[], jsonb) to anon, authenticated;
revoke execute on function public.expire_overdue() from public, anon;
grant execute on function public.expire_overdue() to authenticated;
revoke execute on function public.create_order(text, text[], jsonb) from public, anon;
grant execute on function public.create_order(text, text[], jsonb) to authenticated;
revoke execute on function public.submit_payment_proof(uuid, text, text, integer, text) from public, anon;
grant execute on function public.submit_payment_proof(uuid, text, text, integer, text) to authenticated;
revoke execute on function public.admin_review_order(uuid, boolean, text, jsonb) from public, anon;
grant execute on function public.admin_review_order(uuid, boolean, text, jsonb) to authenticated;
revoke execute on function public.admin_verify_payment(uuid, boolean, text) from public, anon;
grant execute on function public.admin_verify_payment(uuid, boolean, text) to authenticated;
revoke execute on function public.admin_cancel_order(uuid, text) from public, anon;
grant execute on function public.admin_cancel_order(uuid, text) to authenticated;
revoke execute on function public.complete_project_details(uuid, text) from public, anon;
grant execute on function public.complete_project_details(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Katalog awal (dari sistem lama). Semua bisa diubah admin dari dashboard.
-- ---------------------------------------------------------------------------

insert into public.packages (key, name, tagline, indicators, features, visits, purchase_allowance, entitlements, recommended, sort_order) values
('essential', 'SilentCX Essential', 'Kunjungan rahasia dasar dan potret CX outlet Anda', 'Sekitar 30 indikator audit',
  array['1 outlet', '1 kunjungan rahasia', 'Sekitar 30 indikator audit', 'Sapaan dan sikap pelayanan', 'Pengetahuan produk', 'Ketepatan pesanan',
        'Kecepatan pelayanan', 'Kebersihan dan suasana', 'Upselling dan closing', 'Skor CX keseluruhan', '3–5 temuan utama',
        'Rekomendasi cepat', 'Laporan audit PDF', 'Debrief hasil 15 menit', 'Biaya pembelian hingga Rp150.000 per kunjungan'],
  1, 150000, array['report_basic'], false, 1),
('insight', 'SilentCX Insight', 'Diagnosis mendalam dengan bukti dan kepatuhan SOP', 'Sekitar 50–70 indikator audit',
  array['1 outlet', '1 kunjungan rahasia', 'Sekitar 50–70 indikator audit', 'Semua area penilaian Essential', 'Pemeriksaan kepatuhan SOP',
        'Evaluasi customer journey', 'Bukti dan dokumentasi', 'Klasifikasi tingkat keparahan', 'Analisis gap', '5–10 temuan prioritas',
        'Rekomendasi yang bisa dijalankan', 'Ringkasan manajemen', 'Laporan audit lengkap', 'Konsultasi 30 menit',
        'Biaya pembelian hingga Rp150.000 per kunjungan'],
  1, 150000, array['report_basic', 'report_detailed', 'sop', 'evidence', 'consultation'], true, 2),
('performance', 'SilentCX Performance', 'Benchmark multi-outlet dan intelijen untuk manajemen', 'Sekitar 50–70 indikator × outlet',
  array['3–5 outlet', '1 kunjungan per outlet', 'Semua fitur Insight', 'Audit multi-outlet', 'Perbandingan antar cabang', 'Peringkat outlet',
        'Perbandingan kepatuhan SOP', 'Benchmark CX', 'Identifikasi red flag', 'Analisis tren antar outlet', 'Rekomendasi untuk manajemen',
        'Ringkasan eksekutif', 'Review manajemen', 'Biaya pembelian hingga Rp150.000 per kunjungan'],
  1, 150000, array['report_basic', 'report_detailed', 'sop', 'evidence', 'consultation', 'multi_outlet', 'benchmarking'], false, 3);

insert into public.package_prices (package_id, outlets, price)
select p.id, v.outlets, v.price
from public.packages p
join (values ('essential', 1, 1249000), ('insight', 1, 1749000),
             ('performance', 3, 3749000), ('performance', 4, 4599000), ('performance', 5, 5399000)) as v(key, outlets, price)
  on v.key = p.key;

insert into public.addons (key, name, description, unit, pricing, price, max_qty, adds_outlets, requires_review, entitlement, applicable_packages, sort_order) values
('additional_outlet', 'Outlet tambahan', 'Menambah satu outlet ke proyek audit.', 'per outlet', 'fixed', 1099000, 10, true, false, null, '{}', 1),
('additional_visit', 'Kunjungan tambahan', 'Menambah satu kunjungan rahasia untuk satu outlet.', 'per kunjungan', 'fixed', 749000, 10, false, false, 'additional_visit', '{}', 2),
('competitor_benchmark', 'Benchmark kompetitor', 'Membandingkan outlet Anda dengan kompetitor langsung.', 'per kompetitor', 'fixed', 1299000, 5, false, false, 'competitor', array['insight', 'performance'], 3),
('re_audit', 'Audit ulang', 'Siklus audit lanjutan untuk memastikan perbaikan berjalan.', 'per outlet', 'fixed', 899000, 10, false, true, 're_audit', array['insight', 'performance'], 4),
('custom_questionnaire', 'Kuesioner khusus', 'Pertanyaan dan bobot audit yang disesuaikan dengan brand Anda.', 'per proyek', 'quote', 650000, 1, false, false, 'custom_scope', array['insight', 'performance'], 5),
('additional_consultation', 'Konsultasi tambahan', 'Sesi strategi tambahan dengan konsultan CX.', 'per sesi', 'fixed', 499000, 5, false, false, 'consultation_extra', '{}', 6),
('priority_report', 'Laporan express', 'Laporan dikirim lebih cepat.', 'per proyek', 'fixed', 599000, 1, false, false, 'priority', '{}', 7),
('out_of_city', 'Tugas luar kota', 'Biaya perjalanan untuk outlet di luar kota yang kami layani.', 'per outlet', 'quote', 0, 10, false, false, null, '{}', 8),
('excess_purchase', 'Kelebihan biaya pembelian', 'Penggantian pembelian di atas batas Rp150.000 per kunjungan.', 'sesuai biaya', 'quote', 0, 1, false, false, null, '{}', 9);

insert into public.app_settings (key, value) values
  ('payment', jsonb_build_object('bank_name', '', 'account_number', '', 'account_holder', '', 'qris_url', ''));
