-- Promo potongan nominal (Rp) selain persen, untuk paket dan add-on.
--
-- Satu promo memakai salah satu: promo_pct (1–90%) atau promo_amount (Rp, per unit). Untuk paket dengan beberapa
-- harga per jumlah outlet (Performance), potongan nominal mengurangi setiap harga dengan jumlah yang sama, jadi
-- potongan harus lebih kecil dari harga termurah paket itu. Fungsi harga di bawah disalin dari definisi terakhirnya
-- dan hanya berubah di pemanggilan promo_price.

alter table public.packages add column promo_amount integer check (promo_amount > 0);
alter table public.addons add column promo_amount integer check (promo_amount > 0);

alter table public.packages drop constraint packages_promo_dates;
alter table public.packages add constraint packages_promo_dates check (
  (promo_pct is null and promo_amount is null)
  or (promo_starts_at is not null and promo_ends_at is not null and promo_ends_at > promo_starts_at)
);
alter table public.packages add constraint packages_promo_one_kind check (promo_pct is null or promo_amount is null);

alter table public.addons drop constraint addons_promo_dates;
alter table public.addons add constraint addons_promo_dates check (
  (promo_pct is null and promo_amount is null)
  or (promo_starts_at is not null and promo_ends_at is not null and promo_ends_at > promo_starts_at)
);
alter table public.addons add constraint addons_promo_one_kind check (promo_pct is null or promo_amount is null);
alter table public.addons add constraint addons_promo_amount_below_price check (promo_amount is null or promo_amount < price);

-- Potongan nominal paket harus di bawah harga termurahnya, juga saat daftar harga diubah sesudahnya.
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
    raise exception 'Potongan promo harus lebih kecil dari harga termurah paket (Rp%).', to_char(cheapest, 'FM999G999G999') using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger packages_promo_amount after insert or update of promo_amount on public.packages
  for each row execute function public.check_package_promo_amount();
create trigger package_prices_promo_amount after insert or update of price on public.package_prices
  for each row execute function public.check_package_promo_amount();

-- Harga setelah promo yang sedang berlaku: persen atau potongan nominal.
create or replace function public.promo_price(p_price integer, p_pct integer, p_amount integer, p_starts timestamptz, p_ends timestamptz)
returns integer
language sql stable as $$
  select case
    when now() < p_starts or now() >= p_ends then p_price
    when p_pct is not null then round(p_price * (100 - p_pct) / 100.0)::integer
    when p_amount is not null then greatest(p_price - p_amount, 0)
    else p_price
  end;
$$;

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
      unit := public.promo_price(a.price, a.promo_pct, a.promo_amount, a.promo_starts_at, a.promo_ends_at);
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
  unit := public.promo_price(a.price, a.promo_pct, a.promo_amount, a.promo_starts_at, a.promo_ends_at);

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
  unit := public.promo_price(a.price, a.promo_pct, a.promo_amount, a.promo_starts_at, a.promo_ends_at);
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
