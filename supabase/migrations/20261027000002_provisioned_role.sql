-- Fase 0, perbaikan: Supabase Auth (admin.createUser) menyimpan app_metadata sesaat SETELAH baris
-- auth.users dibuat, sehingga trigger pembuatan profil belum melihat provisioned_role dan akun
-- admin/shopper hasil provisioning tercatat sebagai client. Role provisioning kini juga diterapkan
-- saat app_metadata berubah. app_metadata hanya bisa ditulis dengan service role, tidak dari browser.

create or replace function public.handle_user_provisioned() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  provisioned text := new.raw_app_meta_data ->> 'provisioned_role';
  current_profile public.profiles;
begin
  if provisioned is not distinct from (old.raw_app_meta_data ->> 'provisioned_role')
     or provisioned not in ('admin', 'shopper') then
    return new;
  end if;

  select * into current_profile from public.profiles where id = new.id;
  if not found or (current_profile.role = provisioned::public.app_role and current_profile.status = 'active') then
    return new;
  end if;

  update public.profiles
  set role = provisioned::public.app_role, status = 'active', status_note = null
  where id = new.id;

  insert into public.activity_log (actor_id, action, target_type, target_id, detail)
  values (null, 'account.provisioned', 'profile', new.id::text,
          jsonb_build_object('from_role', current_profile.role, 'to_role', provisioned));
  return new;
end;
$$;

create trigger on_auth_user_provisioned after update of raw_app_meta_data on auth.users
  for each row execute function public.handle_user_provisioned();

revoke execute on function public.handle_user_provisioned() from public, anon, authenticated;

-- Memperbaiki akun provisioning yang sudah terlanjur tercatat salah (misalnya akun demo).
with fixed as (
  update public.profiles p
  set role = (u.raw_app_meta_data ->> 'provisioned_role')::public.app_role, status = 'active', status_note = null
  from auth.users u
  where u.id = p.id
    and u.raw_app_meta_data ->> 'provisioned_role' in ('admin', 'shopper')
    and (p.role::text <> u.raw_app_meta_data ->> 'provisioned_role' or p.status <> 'active')
  returning p.id, u.raw_app_meta_data ->> 'provisioned_role' as to_role
)
insert into public.activity_log (actor_id, action, target_type, target_id, detail)
select null, 'account.provisioned', 'profile', id::text, jsonb_build_object('to_role', to_role, 'repair', true)
from fixed;
