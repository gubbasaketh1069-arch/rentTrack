-- ============================================================================
-- RentTrack migration 005 — tenant portal access
-- ============================================================================
-- 1. A logged-in tenant (tenants.user_id = auth.uid()) can READ the property,
--    floors, flat and features tied to their own tenancies. Tenants still
--    cannot see other properties, other tenants, expenses, or owner data.
-- 2. link_tenant_login(): lets a property manager link a tenant's login
--    (profiles row, role TENANT) to a tenants row by email — without giving
--    owners read access to the profiles table.
--
-- Run in the Supabase SQL editor AFTER 001-004.

-- ----------------------------------------------------------------------------
-- 1. Tenant read access to their own property / floors / flat / features
-- ----------------------------------------------------------------------------

create policy "Tenant reads own tenancy properties"
  on public.properties for select
  using (
    exists (
      select 1 from public.tenancies t
      where t.property_id = public.properties.id
        and t.tenant_id = public.my_tenant_id()
    )
  );

create policy "Tenant reads own tenancy floors"
  on public.floors for select
  using (
    exists (
      select 1 from public.tenancies t
      where t.property_id = public.floors.property_id
        and t.tenant_id = public.my_tenant_id()
    )
  );

create policy "Tenant reads own tenancy flats"
  on public.flats for select
  using (
    exists (
      select 1 from public.tenancies t
      where t.flat_id = public.flats.id
        and t.tenant_id = public.my_tenant_id()
    )
  );

create policy "Tenant reads own flat features"
  on public.flat_features for select
  using (
    exists (
      select 1 from public.flats f
      join public.tenancies t on t.flat_id = f.id
      where f.id = public.flat_features.flat_id
        and t.tenant_id = public.my_tenant_id()
    )
  );

-- ----------------------------------------------------------------------------
-- 2. link_tenant_login(): owner links a tenant login email to a tenants row
-- ----------------------------------------------------------------------------

create or replace function public.link_tenant_login(p_tenant_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
begin
  -- Caller must have write access to a property this tenant has a tenancy in.
  if not exists (
    select 1 from public.tenancies t
    where t.tenant_id = p_tenant_id
      and public.has_property_write_access(t.property_id)
  ) then
    raise exception 'not authorized to link this tenant';
  end if;

  select p.id into v_profile_id
  from public.profiles p
  where lower(p.email) = lower(trim(p_email))
    and p.role = 'TENANT'
  limit 1;

  if v_profile_id is null then
    raise exception 'no tenant login found for that email';
  end if;

  -- One login belongs to at most one tenant record.
  if exists (
    select 1 from public.tenants t2
    where t2.user_id = v_profile_id and t2.id <> p_tenant_id
  ) then
    raise exception 'that login is already linked to another tenant';
  end if;

  update public.tenants
  set user_id = v_profile_id, updated_at = now()
  where id = p_tenant_id;

  return v_profile_id;
end;
$$;

revoke all on function public.link_tenant_login(uuid, text) from public, anon, authenticated;
grant execute on function public.link_tenant_login(uuid, text) to authenticated;
