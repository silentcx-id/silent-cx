-- Daftar akun admin: pencarian, filter, dan halaman 10 per halaman dihitung di database.
--
-- Data shopper (jangkauan kota, bisnis yang diminati, jenis kelamin) diambil dari lamarannya: yang sudah disetujui
-- lebih dulu, kalau belum ada, lamaran terbaru. Data pemilik bisnis dari perusahaan (kota, jenis usaha) dan kota
-- outlet di pesanannya.

create or replace function public.admin_list_accounts(
  p_role text default null,
  p_status text default null,
  p_q text default '',
  p_city text default '',
  p_interest text default '',
  p_gender text default '',
  p_limit integer default 10,
  p_offset integer default 0
)
returns table (
  id uuid,
  full_name text,
  email text,
  phone text,
  role public.app_role,
  status public.account_status,
  status_note text,
  created_at timestamptz,
  cities text[],
  interests text[],
  gender text,
  company text,
  total bigint
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  q text := replace(replace(replace(btrim(coalesce(p_q, '')), '\', '\\'), '%', '\%'), '_', '\_');
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa melihat daftar akun.' using errcode = '42501';
  end if;
  return query
  select
    p.id, p.full_name, p.email, p.phone, p.role, p.status, p.status_note, p.created_at,
    case when p.role = 'shopper' then coalesce(app.reachable_cities, '{}') else array_remove(array[nullif(c.city, '')], null) end,
    case when p.role = 'shopper' then coalesce(app.industries, '{}') else array_remove(array[nullif(c.industry, '')], null) end,
    app.gender,
    nullif(c.name, ''),
    count(*) over ()
  from public.profiles p
  left join lateral (
    select a.reachable_cities, a.industries, a.gender
    from public.shopper_applications a
    where a.shopper_id = p.id
    order by (a.status = 'approved') desc, a.created_at desc
    limit 1
  ) app on p.role = 'shopper'
  left join public.companies c on c.client_id = p.id
  where p.role <> 'admin'
    and (nullif(p_role, '') is null or p.role::text = p_role)
    and (nullif(p_status, '') is null or p.status::text = p_status)
    and (q = '' or p.full_name ilike '%' || q || '%' or p.email ilike '%' || q || '%' or coalesce(p.phone, '') ilike '%' || q || '%'
         or coalesce(c.name, '') ilike '%' || q || '%')
    and (coalesce(p_city, '') = ''
         or (p.role = 'shopper' and p_city = any (app.reachable_cities))
         or (p.role = 'client' and (lower(c.city) = lower(p_city)
             or exists (select 1 from public.project_outlets po join public.projects pr on pr.id = po.project_id
                        where pr.client_id = p.id and lower(po.city) = lower(p_city)))))
    and (coalesce(p_interest, '') = ''
         or (p.role = 'shopper' and p_interest = any (app.industries))
         or (p.role = 'client' and c.industry = p_interest))
    and (coalesce(p_gender, '') = '' or app.gender = p_gender)
  order by p.created_at desc, p.id
  limit least(greatest(coalesce(p_limit, 10), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.admin_list_accounts(text, text, text, text, text, text, integer, integer) from public, anon;
grant execute on function public.admin_list_accounts(text, text, text, text, text, text, integer, integer) to authenticated;
