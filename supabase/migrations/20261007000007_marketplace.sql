-- ============================================================================
-- RentTrack migration 007 — marketplace: invitation accept flow + tenant
-- marketplace read access.
-- ============================================================================
-- 1. Invited users can read their own pending invitations (matched by email)
--    and accept/decline them via SECURITY DEFINER RPCs. Accepting creates the
--    property_members row; declining only flips the invitation status.
--    Removing a member never touches property data (no cascade from members
--    to property records).
-- 2. Tenants can read the property / flat / floor / feature rows that back
--    PUBLISHED or FEATURED listings, so Find-a-Flat search works. Owner
--    identity stays private: profiles remain readable only by self/co-members.
--
-- Run in the Supabase SQL editor AFTER 001–006.

-- ----------------------------------------------------------------------------
-- 1a. Invitee reads their own invitations
-- ----------------------------------------------------------------------------
drop policy if exists "Invitee reads own invitations"
  on public.property_invitations;

create policy "Invitee reads own invitations"
  on public.property_invitations for select
  using (
    lower(email) = lower(auth.jwt() ->> 'email')
  );

-- ----------------------------------------------------------------------------
-- 1b. Accept / decline invitation RPCs
-- ----------------------------------------------------------------------------
create or replace function public.accept_property_invitation(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv   public.property_invitations%rowtype;
  v_email text;
begin
  v_email := lower(auth.jwt() ->> 'email');
  if v_email is null or auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_inv
  from public.property_invitations
  where id = p_invitation_id;

  if not found then
    raise exception 'Invitation not found';
  end if;
  if v_inv.status <> 'PENDING' then
    raise exception 'Invitation is no longer pending';
  end if;
  if lower(v_inv.email) <> v_email then
    raise exception 'This invitation was sent to a different email address';
  end if;
  if v_inv.role = 'PRIMARY_OWNER' then
    raise exception 'Primary ownership cannot be transferred via invitation';
  end if;

  insert into public.property_members (property_id, user_id, role)
  values (v_inv.property_id, auth.uid(), v_inv.role)
  on conflict (property_id, user_id)
  do update set role = excluded.role;

  update public.property_invitations
  set status = 'ACCEPTED', updated_at = now()
  where id = p_invitation_id;

  return v_inv.property_id;
end;
$$;

create or replace function public.decline_property_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv   public.property_invitations%rowtype;
  v_email text;
begin
  v_email := lower(auth.jwt() ->> 'email');
  if v_email is null or auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_inv
  from public.property_invitations
  where id = p_invitation_id;

  if not found then
    raise exception 'Invitation not found';
  end if;
  if lower(v_inv.email) <> v_email then
    raise exception 'This invitation was sent to a different email address';
  end if;

  update public.property_invitations
  set status = 'DECLINED', updated_at = now()
  where id = p_invitation_id and status = 'PENDING';
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. Marketplace read access: rows backing PUBLISHED/FEATURED listings
-- ----------------------------------------------------------------------------
drop policy if exists "Marketplace reads listed properties"
  on public.properties;
create policy "Marketplace reads listed properties"
  on public.properties for select
  using (
    exists (
      select 1 from public.property_listings l
      where l.property_id = public.properties.id
        and l.status in ('PUBLISHED', 'FEATURED')
    )
  );

drop policy if exists "Marketplace reads listed flats"
  on public.flats;
create policy "Marketplace reads listed flats"
  on public.flats for select
  using (
    exists (
      select 1 from public.property_listings l
      where l.flat_id = public.flats.id
        and l.status in ('PUBLISHED', 'FEATURED')
    )
  );

drop policy if exists "Marketplace reads floors of listed flats"
  on public.floors;
create policy "Marketplace reads floors of listed flats"
  on public.floors for select
  using (
    exists (
      select 1
      from public.flats f
      join public.property_listings l on l.flat_id = f.id
      where f.floor_id = public.floors.id
        and l.status in ('PUBLISHED', 'FEATURED')
    )
  );

drop policy if exists "Marketplace reads features of listed flats"
  on public.flat_features;
create policy "Marketplace reads features of listed flats"
  on public.flat_features for select
  using (
    exists (
      select 1 from public.property_listings l
      where l.flat_id = public.flat_features.flat_id
        and l.status in ('PUBLISHED', 'FEATURED')
    )
  );
