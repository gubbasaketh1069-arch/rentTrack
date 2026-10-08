-- ============================================================================
-- RentTrack migration 004 — auth trigger (profiles) + property member bootstrap
-- ============================================================================
-- 1. When a user signs up (auth.users insert), automatically create their
--    public.profiles row. The account type (OWNER / TENANT) is chosen on the
--    signup form and passed via the signUp `data` option, which Supabase
--    stores in auth.users.raw_user_meta_data.
-- 2. When a property is created, automatically add the owner as a
--    PRIMARY_OWNER row in property_members so shared-property queries and
--    the property switcher work uniformly.
--
-- Run in the Supabase SQL editor AFTER 001/002/003.

-- ----------------------------------------------------------------------------
-- 1. profiles row on signup
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  v_role := coalesce(nullif(new.raw_user_meta_data ->> 'role', ''), 'OWNER');
  if v_role not in ('OWNER', 'TENANT') then
    v_role := 'OWNER';
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    v_role
  )
  on conflict (id) do update set
    email     = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 2. PRIMARY_OWNER membership on property creation
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_property()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.property_members (property_id, user_id, role)
  values (new.id, new.owner_id, 'PRIMARY_OWNER')
  on conflict (property_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_property_created on public.properties;
create trigger on_property_created
  after insert on public.properties
  for each row execute function public.handle_new_property();
