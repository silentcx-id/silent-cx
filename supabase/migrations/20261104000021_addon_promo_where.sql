-- Supabase menolak UPDATE tanpa WHERE (safeupdate). Tabel addon_promo hanya satu baris (id = true),
-- jadi admin_set_addon_promo dari 20261104000020 kini memperbarui baris itu secara eksplisit.

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
    update public.addon_promo set promo_pct = null, promo_amount = null, promo_starts_at = null, promo_ends_at = null, updated_at = now()
    where id;
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
  set promo_pct = p_pct, promo_amount = p_amount, promo_starts_at = p_starts, promo_ends_at = p_ends, updated_at = now()
    where id;
  perform public.log_activity('catalog.addon_promo_set', 'addon_promo', 'global',
    jsonb_build_object('pct', p_pct, 'amount', p_amount, 'starts', p_starts, 'ends', p_ends));
end;
$$;
