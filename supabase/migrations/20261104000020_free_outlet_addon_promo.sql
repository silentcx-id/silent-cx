-- Promo Gratis 1 outlet untuk paket multi-outlet (Performance) dan promo global untuk semua add-on.
--
-- Gratis 1 outlet: client yang memilih N outlet membayar harga paket untuk N−1 outlet. Berlaku kalau daftar harga
-- paket punya baris untuk N−1 outlet (Performance: mulai 4 outlet). Potongannya dicatat sebagai baris invoice
-- tersendiri (kind 'promo', jumlah negatif). Satu paket hanya punya satu jenis promo: persen, nominal, atau gratis outlet.
--
-- Promo global add-on: satu promo (persen atau nominal) untuk semua add-on aktif berharga pasti. Add-on berharga
-- "dikonfirmasi admin" tidak ikut. Promo global dan promo per add-on tidak boleh berlaku di periode yang sama:
-- database menolak salah satunya sesuai urutan disimpan, dengan pesan yang menyebut nama add-on yang bentrok.
-- Fungsi harga di bawah disalin dari definisi terakhirnya (20261031000016); harga add-on kini lewat addon_unit_price.

-- ---------------------------------------------------------------------------
-- 1. Paket: promo gratis 1 outlet
-- ---------------------------------------------------------------------------

alter table public.packages add column promo_free_outlet boolean not null default false;

alter table public.packages drop constraint packages_promo_dates;
alter table public.packages add constraint packages_promo_dates check (
  (promo_pct is null and promo_amount is null and not promo_free_outlet)
  or (promo_starts_at is not null and promo_ends_at is not null and promo_ends_at > promo_starts_at)
);
alter table public.packages drop constraint packages_promo_one_kind;
alter table public.packages add constraint packages_promo_one_kind check (num_nonnulls(promo_pct, promo_amount, nullif(promo_free_outlet, false)) <= 1);

-- Gratis outlet hanya untuk paket dengan lebih dari satu harga per jumlah outlet.
create or replace function public.check_package_free_outlet()
returns trigger
language plpgsql as $$
begin
  if new.promo_free_outlet and (select count(*) from public.package_prices where package_id = new.id) < 2 then
    raise exception 'Promo gratis 1 outlet hanya untuk paket dengan beberapa pilihan jumlah outlet.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger packages_promo_free_outlet after insert or update of promo_free_outlet on public.packages
  for each row execute function public.check_package_free_outlet();

-- Baris potongan promo di invoice: jumlahnya negatif, baris lain tetap tidak boleh negatif.
alter table public.invoice_lines drop constraint invoice_lines_kind_check;
alter table public.invoice_lines add constraint invoice_lines_kind_check check (kind in ('package', 'addon', 'promo'));
alter table public.invoice_lines drop constraint invoice_lines_unit_price_check;
alter table public.invoice_lines add constraint invoice_lines_unit_price_check check (case when kind = 'promo' then unit_price <= 0 else unit_price >= 0 end);
alter table public.invoice_lines drop constraint invoice_lines_amount_check;
alter table public.invoice_lines add constraint invoice_lines_amount_check check (case when kind = 'promo' then amount <= 0 else amount >= 0 end);

-- ---------------------------------------------------------------------------
-- 2. Promo global add-on (satu baris)
-- ---------------------------------------------------------------------------

create table public.addon_promo (
  id boolean primary key default true check (id),
  promo_pct integer check (promo_pct between 1 and 90),
  promo_amount integer check (promo_amount > 0),
  promo_starts_at timestamptz,
  promo_ends_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint addon_promo_dates check (
    (promo_pct is null and promo_amount is null)
    or (promo_starts_at is not null and promo_ends_at is not null and promo_ends_at > promo_starts_at)
  ),
  constraint addon_promo_one_kind check (promo_pct is null or promo_amount is null)
);
insert into public.addon_promo default values;

alter table public.addon_promo enable row level security;
create policy "promo add-on dibaca semua" on public.addon_promo for select to anon, authenticated using (true);
revoke insert, update, delete on public.addon_promo from anon, authenticated;

-- Tanggal pendek WIB untuk pesan, misalnya "30 Nov 2026".
create or replace function public.wib_date(p_ts timestamptz)
returns text
language sql stable as $$
  select extract(day from p_ts at time zone 'Asia/Jakarta')::integer || ' '
    || (array['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'])[extract(month from p_ts at time zone 'Asia/Jakarta')::integer] || ' '
    || extract(year from p_ts at time zone 'Asia/Jakarta')::integer;
$$;

-- Angka rupiah untuk pesan, misalnya "1.099.000".
create or replace function public.rp_text(p integer)
returns text
language sql immutable as $$
  select replace(to_char(p, 'FM999,999,999,999'), ',', '.');
$$;

-- Pesan batas potongan paket memakai titik ribuan seperti di website.
create or replace function public.check_package_promo_amount()
returns trigger
language plpgsql as $$
declare
  pkg uuid;
  amount integer;
  cheapest integer;
begin
  if tg_table_name = 'packages' then pkg := new.id; else pkg := new.package_id; end if;
  select p.promo_amount into amount from public.packages p where p.id = pkg;
  if amount is null then return new; end if;
  select min(pp.price) into cheapest from public.package_prices pp where pp.package_id = pkg;
  if cheapest is not null and amount >= cheapest then
    raise exception 'Potongan promo harus lebih kecil dari harga termurah paket (Rp%).', public.rp_text(cheapest) using errcode = '22023';
  end if;
  return new;
end;
$$;

-- Harga satuan add-on: promo add-on itu sendiri kalau sedang berlaku, kalau tidak promo global (hanya harga pasti).
create or replace function public.addon_unit_price(a public.addons)
returns integer
language sql stable security definer set search_path = public as $$
  select case
    when a.pricing = 'quote' then a.price
    when (a.promo_pct is not null or a.promo_amount is not null) and now() >= a.promo_starts_at and now() < a.promo_ends_at
      then public.promo_price(a.price, a.promo_pct, a.promo_amount, a.promo_starts_at, a.promo_ends_at)
    else coalesce((select public.promo_price(a.price, g.promo_pct, g.promo_amount, g.promo_starts_at, g.promo_ends_at) from public.addon_promo g), a.price)
  end;
$$;
revoke execute on function public.addon_unit_price(public.addons) from public, anon;

-- Admin menyimpan promo global. Semua isian null = hentikan promo.
create or replace function public.admin_set_addon_promo(p_pct integer, p_amount integer, p_starts timestamptz, p_ends timestamptz)
returns void
language plpgsql security definer set search_path = public as $$
declare
  clash text;
  cheap text;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa mengatur promo.' using errcode = '42501';
  end if;

  if p_pct is null and p_amount is null then
    update public.addon_promo set promo_pct = null, promo_amount = null, promo_starts_at = null, promo_ends_at = null, updated_at = now();
    perform public.log_activity('catalog.addon_promo_cleared', 'addon_promo', 'global', '{}'::jsonb);
    return;
  end if;
  if p_pct is not null and p_amount is not null then
    raise exception 'Pilih salah satu: persen atau nominal.' using errcode = '22023';
  end if;
  if p_starts is null or p_ends is null then
    raise exception 'Isi tanggal mulai dan selesai promo.' using errcode = '22023';
  end if;
  if p_ends <= p_starts then
    raise exception 'Tanggal selesai promo harus setelah tanggal mulai.' using errcode = '22023';
  end if;

  -- Add-on yang punya promo sendiri, masih berlaku atau dijadwalkan, dan periodenya bertabrakan.
  select string_agg(a.name || ' (' || case when a.promo_pct is not null then 'Hemat ' || a.promo_pct || '%'
                                           else 'Hemat Rp' || public.rp_text(a.promo_amount) end
                    || ', s.d. ' || public.wib_date(a.promo_ends_at) || ')', ', ' order by a.sort_order, a.name)
  into clash
  from public.addons a
  where a.active and (a.promo_pct is not null or a.promo_amount is not null)
    and a.promo_ends_at > now() and a.promo_starts_at < p_ends and a.promo_ends_at > p_starts;
  if clash is not null then
    raise exception 'Promo global tidak bisa disimpan. Add-on ini masih punya promo sendiri: %. Hentikan promonya dulu, lalu simpan lagi.', clash using errcode = '22023';
  end if;

  if p_amount is not null then
    select string_agg(a.name || ' (Rp' || public.rp_text(a.price) || ')', ', ' order by a.sort_order, a.name)
    into cheap
    from public.addons a
    where a.active and a.pricing = 'fixed' and a.price <= p_amount;
    if cheap is not null then
      raise exception 'Potongan Rp% tidak bisa disimpan karena tidak lebih kecil dari harga add-on ini: %. Kecilkan potongannya atau pakai persen.', public.rp_text(p_amount), cheap using errcode = '22023';
    end if;
  end if;

  update public.addon_promo
  set promo_pct = p_pct, promo_amount = p_amount, promo_starts_at = p_starts, promo_ends_at = p_ends, updated_at = now();
  perform public.log_activity('catalog.addon_promo_set', 'addon_promo', 'global',
    jsonb_build_object('pct', p_pct, 'amount', p_amount, 'starts', p_starts, 'ends', p_ends));
end;
$$;
revoke execute on function public.admin_set_addon_promo(integer, integer, timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_set_addon_promo(integer, integer, timestamptz, timestamptz) to authenticated;

-- Selama promo global berlaku atau dijadwalkan: promo per add-on yang bertabrakan ditolak, dan harga add-on
-- berharga pasti harus tetap di atas potongan nominal global.
create or replace function public.check_addon_vs_global_promo()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  g public.addon_promo;
begin
  select * into g from public.addon_promo;
  if g.promo_ends_at is null or g.promo_ends_at <= now() then return new; end if;

  if (new.promo_pct is not null or new.promo_amount is not null) and new.promo_ends_at > now()
     and new.promo_starts_at < g.promo_ends_at and new.promo_ends_at > g.promo_starts_at
     and (tg_op = 'INSERT' or (new.promo_pct, new.promo_amount, new.promo_starts_at, new.promo_ends_at)
                                is distinct from (old.promo_pct, old.promo_amount, old.promo_starts_at, old.promo_ends_at)) then
    raise exception 'Promo global add-on sedang berlaku s.d. %. Promo per add-on tidak bisa dipasang di periode itu.', public.wib_date(g.promo_ends_at) using errcode = '22023';
  end if;

  if g.promo_amount is not null and new.active and new.pricing = 'fixed' and new.price <= g.promo_amount
     and (tg_op = 'INSERT' or (new.price, new.active, new.pricing) is distinct from (old.price, old.active, old.pricing)) then
    raise exception 'Harga % harus di atas potongan promo global add-on (Rp%).', new.name, public.rp_text(g.promo_amount) using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger addons_vs_global_promo before insert or update on public.addons
  for each row execute function public.check_addon_vs_global_promo();

-- ---------------------------------------------------------------------------
-- 3. Fungsi harga
-- ---------------------------------------------------------------------------

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
  free integer := 0;
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
      unit := public.addon_unit_price(a);
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

  unit := public.promo_price(base_price, pkg.promo_pct, pkg.promo_amount, pkg.promo_starts_at, pkg.promo_ends_at);
  -- Gratis 1 outlet: bayar harga paket untuk satu outlet lebih sedikit, dicatat sebagai baris potongan.
  if pkg.promo_free_outlet and now() >= pkg.promo_starts_at and now() < pkg.promo_ends_at then
    select greatest(base_price - pp.price, 0) into free from public.package_prices pp where pp.package_id = pkg.id and pp.outlets = base_outlets - 1;
    free := coalesce(free, 0);
  end if;
  total := total + unit - free;
  lines := jsonb_build_array(jsonb_build_object(
    'kind', 'package', 'item_key', pkg.key, 'label', pkg.name || ' (' || base_outlets || ' outlet)', 'quantity', 1,
    'unit_price', unit, 'amount', unit, 'list_price', base_price, 'estimate', null))
    || case when free > 0 then jsonb_build_array(jsonb_build_object(
      'kind', 'promo', 'item_key', 'free_outlet', 'label', 'Promo gratis 1 outlet', 'quantity', 1,
      'unit_price', -free, 'amount', -free, 'list_price', null, 'estimate', null)) else '[]'::jsonb end
    || addon_lines;

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
      'purchase_allowance', pkg.purchase_allowance, 'price', unit - free, 'list_price', base_price),
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
  unit := public.addon_unit_price(a);

  insert into public.invoices (code, project_id, client_id, status, total, due_at, kind)
  values (public.next_code('INV'), p_project, auth.uid(), 'unpaid', unit * p_qty, now() + interval '48 hours', 'consultation')
  returning id into v_invoice;
  insert into public.invoice_lines (invoice_id, position, kind, item_key, label, quantity, unit_price, amount, list_price)
  values (v_invoice, 1, 'addon', 'additional_consultation', a.name, p_qty, unit, unit * p_qty, a.price);

  perform public.log_activity('consultation.purchased', 'invoice', v_invoice::text, jsonb_build_object('project', p_project, 'quantity', p_qty, 'total', unit * p_qty));
  return v_invoice;
end;
$$;

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
  unit := public.addon_unit_price(a);
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
