-- ============================================================================
-- RentTrack migration 002 — Row Level Security
-- ============================================================================
-- First-pass policies: real access control, no USING (true).
--
-- Access model:
--   * Owners (properties.owner_id = auth.uid()) and property_members
--     (PRIMARY_OWNER / CO_OWNER / MANAGER / EDITOR / VIEWER) access their
--     properties' data. VIEWER is read-only.
--   * Tenants (tenants.user_id = auth.uid()) read their own tenancy data.
--   * PUBLISHED marketplace listings are publicly readable.
--   * notification_logs inserts are service-role only (no anon policy).
--
-- Frontend checks alone are never sufficient — these policies are the
-- enforcement layer (spec section 63).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so they bypass RLS and avoid recursion)
-- ----------------------------------------------------------------------------

create or replace function public.has_property_access(p_property_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select
    exists (select 1 from public.properties p
            where p.id = p_property_id and p.owner_id = auth.uid())
    or
    exists (select 1 from public.property_members pm
            where pm.property_id = p_property_id and pm.user_id = auth.uid());
$$;

create or replace function public.has_property_write_access(p_property_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select
    exists (select 1 from public.properties p
            where p.id = p_property_id and p.owner_id = auth.uid())
    or
    exists (select 1 from public.property_members pm
            where pm.property_id = p_property_id
              and pm.user_id = auth.uid()
              and pm.role <> 'VIEWER');
$$;

create or replace function public.my_tenant_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select id from public.tenants where user_id = auth.uid() limit 1;
$$;

create or replace function public.can_manage_members(p_property_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select
    exists (select 1 from public.properties p
            where p.id = p_property_id and p.owner_id = auth.uid())
    or
    exists (select 1 from public.property_members pm
            where pm.property_id = p_property_id
              and pm.user_id = auth.uid()
              and pm.role in ('PRIMARY_OWNER', 'CO_OWNER', 'MANAGER'));
$$;

-- ----------------------------------------------------------------------------
-- Enable RLS on every table
-- ----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.properties enable row level security;
alter table public.property_members enable row level security;
alter table public.property_invitations enable row level security;
alter table public.floors enable row level security;
alter table public.flats enable row level security;
alter table public.flat_features enable row level security;
alter table public.tenants enable row level security;
alter table public.phone_numbers enable row level security;
alter table public.tenancies enable row level security;
alter table public.family_members enable row level security;
alter table public.documents enable row level security;
alter table public.rent_history enable row level security;
alter table public.monthly_records enable row level security;
alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.advance_deposits enable row level security;
alter table public.expenses enable row level security;
alter table public.meters enable row level security;
alter table public.meter_readings enable row level security;
alter table public.property_listings enable row level security;
alter table public.listing_photos enable row level security;
alter table public.saved_listings enable row level security;
alter table public.tenant_interests enable row level security;
alter table public.property_visits enable row level security;
alter table public.maintenance_requests enable row level security;
alter table public.maintenance_workers enable row level security;
alter table public.rental_agreements enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_logs enable row level security;
alter table public.activity_logs enable row level security;

-- ============================================================================
-- profiles
-- ============================================================================

create policy "Users read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users read profiles of property co-members"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.property_members pm1
      join public.property_members pm2
        on pm1.property_id = pm2.property_id
      where pm1.user_id = auth.uid()
        and pm2.user_id = public.profiles.id
    )
  );

create policy "Users insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- ============================================================================
-- properties / property_members / property_invitations
-- ============================================================================

create policy "Property team reads properties"
  on public.properties for select
  using (public.has_property_access(id));

create policy "Owners create properties"
  on public.properties for insert
  with check (owner_id = auth.uid());

create policy "Property team with write role updates properties"
  on public.properties for update
  using (public.has_property_write_access(id));

create policy "Property team with write role deletes properties"
  on public.properties for delete
  using (public.has_property_write_access(id));

create policy "Property team reads members"
  on public.property_members for select
  using (public.has_property_access(property_id));

create policy "Managers manage members"
  on public.property_members for insert
  with check (public.can_manage_members(property_id));

create policy "Managers update members"
  on public.property_members for update
  using (public.can_manage_members(property_id));

create policy "Managers remove members"
  on public.property_members for delete
  using (public.can_manage_members(property_id));

create policy "Property team reads invitations"
  on public.property_invitations for select
  using (public.has_property_access(property_id));

create policy "Managers send invitations"
  on public.property_invitations for insert
  with check (public.can_manage_members(property_id));

create policy "Managers update invitations"
  on public.property_invitations for update
  using (public.can_manage_members(property_id));

create policy "Managers delete invitations"
  on public.property_invitations for delete
  using (public.can_manage_members(property_id));

-- ============================================================================
-- floors / flats / flat_features
-- ============================================================================

create policy "Property team reads floors"
  on public.floors for select
  using (public.has_property_access(property_id));

create policy "Property team writes floors"
  on public.floors for insert
  with check (public.has_property_write_access(property_id));

create policy "Property team updates floors"
  on public.floors for update
  using (public.has_property_write_access(property_id));

create policy "Property team deletes floors"
  on public.floors for delete
  using (public.has_property_write_access(property_id));

create policy "Property team reads flats"
  on public.flats for select
  using (public.has_property_access(property_id));

create policy "Property team writes flats"
  on public.flats for insert
  with check (public.has_property_write_access(property_id));

create policy "Property team updates flats"
  on public.flats for update
  using (public.has_property_write_access(property_id));

create policy "Property team deletes flats"
  on public.flats for delete
  using (public.has_property_write_access(property_id));

create policy "Property team reads flat features"
  on public.flat_features for select
  using (
    exists (select 1 from public.flats f
            where f.id = flat_id
              and public.has_property_access(f.property_id))
  );

create policy "Property team writes flat features"
  on public.flat_features for insert
  with check (
    exists (select 1 from public.flats f
            where f.id = flat_id
              and public.has_property_write_access(f.property_id))
  );

create policy "Property team deletes flat features"
  on public.flat_features for delete
  using (
    exists (select 1 from public.flats f
            where f.id = flat_id
              and public.has_property_write_access(f.property_id))
  );

-- ============================================================================
-- tenants / phone_numbers / tenancies / family_members / documents
-- ============================================================================

create policy "Tenant reads own record; property team reads their tenants"
  on public.tenants for select
  using (
    auth.uid() = user_id
    or created_by = auth.uid()
    or exists (
      select 1 from public.tenancies t
      where t.tenant_id = public.tenants.id
        and public.has_property_access(t.property_id)
    )
  );

create policy "Property team and self create tenant records"
  on public.tenants for insert
  with check (
    auth.uid() = user_id
    or exists (select 1 from public.properties p where p.owner_id = auth.uid())
    or exists (
      select 1 from public.property_members pm
      where pm.user_id = auth.uid() and pm.role <> 'VIEWER'
    )
  );

create policy "Tenant updates own record; property team updates their tenants"
  on public.tenants for update
  using (
    auth.uid() = user_id
    or created_by = auth.uid()
    or exists (
      select 1 from public.tenancies t
      where t.tenant_id = public.tenants.id
        and public.has_property_write_access(t.property_id)
    )
  );

create policy "Property team deletes their tenants"
  on public.tenants for delete
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.tenancies t
      where t.tenant_id = public.tenants.id
        and public.has_property_write_access(t.property_id)
    )
  );

create policy "Tenant and property team read phone numbers"
  on public.phone_numbers for select
  using (
    tenant_id = public.my_tenant_id()
    or exists (
      select 1 from public.tenancies t
      where t.tenant_id = public.phone_numbers.tenant_id
        and public.has_property_access(t.property_id)
    )
  );

create policy "Tenant and property team write phone numbers"
  on public.phone_numbers for insert
  with check (
    tenant_id = public.my_tenant_id()
    or exists (
      select 1 from public.tenancies t
      where t.tenant_id = public.phone_numbers.tenant_id
        and public.has_property_write_access(t.property_id)
    )
  );

create policy "Tenant and property team update phone numbers"
  on public.phone_numbers for update
  using (
    tenant_id = public.my_tenant_id()
    or exists (
      select 1 from public.tenancies t
      where t.tenant_id = public.phone_numbers.tenant_id
        and public.has_property_write_access(t.property_id)
    )
  );

create policy "Tenant and property team delete phone numbers"
  on public.phone_numbers for delete
  using (
    tenant_id = public.my_tenant_id()
    or exists (
      select 1 from public.tenancies t
      where t.tenant_id = public.phone_numbers.tenant_id
        and public.has_property_write_access(t.property_id)
    )
  );

create policy "Tenant reads own tenancies; property team reads theirs"
  on public.tenancies for select
  using (
    tenant_id = public.my_tenant_id()
    or public.has_property_access(property_id)
  );

create policy "Property team creates tenancies"
  on public.tenancies for insert
  with check (public.has_property_write_access(property_id));

create policy "Property team updates tenancies"
  on public.tenancies for update
  using (public.has_property_write_access(property_id));

create policy "Tenant and property team read family members"
  on public.family_members for select
  using (
    tenant_id = public.my_tenant_id()
    or exists (
      select 1 from public.tenancies t
      where t.tenant_id = public.family_members.tenant_id
        and public.has_property_access(t.property_id)
    )
  );

create policy "Tenant self-onboards; property team writes family members"
  on public.family_members for insert
  with check (
    tenant_id = public.my_tenant_id()
    or exists (
      select 1 from public.tenancies t
      where t.tenant_id = public.family_members.tenant_id
        and public.has_property_write_access(t.property_id)
    )
  );

create policy "Tenant and property team update family members"
  on public.family_members for update
  using (
    tenant_id = public.my_tenant_id()
    or exists (
      select 1 from public.tenancies t
      where t.tenant_id = public.family_members.tenant_id
        and public.has_property_write_access(t.property_id)
    )
  );

create policy "Tenant and property team read documents"
  on public.documents for select
  using (
    tenant_id = public.my_tenant_id()
    or family_member_id in (
      select id from public.family_members fm
      where fm.tenant_id = public.my_tenant_id()
    )
    or exists (
      select 1 from public.tenancies t
      where (t.tenant_id = public.documents.tenant_id
             or t.tenant_id in (
               select fm.tenant_id from public.family_members fm
               where fm.id = public.documents.family_member_id
             ))
        and public.has_property_access(t.property_id)
    )
  );

create policy "Tenant uploads; property team writes documents"
  on public.documents for insert
  with check (
    tenant_id = public.my_tenant_id()
    or family_member_id in (
      select id from public.family_members fm
      where fm.tenant_id = public.my_tenant_id()
    )
    or exists (
      select 1 from public.tenancies t
      where (t.tenant_id = public.documents.tenant_id
             or t.tenant_id in (
               select fm.tenant_id from public.family_members fm
               where fm.id = public.documents.family_member_id
             ))
        and public.has_property_write_access(t.property_id)
    )
  );

-- ============================================================================
-- rent_history / monthly_records / payments / allocations / advances
-- ============================================================================

create policy "Tenant and property team read rent history"
  on public.rent_history for select
  using (
    exists (
      select 1 from public.tenancies t
      where t.id = public.rent_history.tenancy_id
        and (t.tenant_id = public.my_tenant_id()
             or public.has_property_access(t.property_id))
    )
    or exists (
      select 1 from public.flats f
      where f.id = public.rent_history.flat_id
        and public.has_property_access(f.property_id)
    )
  );

create policy "Property team writes rent history"
  on public.rent_history for insert
  with check (
    exists (
      select 1 from public.tenancies t
      where t.id = public.rent_history.tenancy_id
        and public.has_property_write_access(t.property_id)
    )
    or exists (
      select 1 from public.flats f
      where f.id = public.rent_history.flat_id
        and public.has_property_write_access(f.property_id)
    )
  );

create policy "Tenant reads own bills; property team reads theirs"
  on public.monthly_records for select
  using (
    public.has_property_access(property_id)
    or exists (
      select 1 from public.tenancies t
      where t.id = public.monthly_records.tenancy_id
        and t.tenant_id = public.my_tenant_id()
    )
  );

create policy "Property team writes monthly records"
  on public.monthly_records for insert
  with check (public.has_property_write_access(property_id));

create policy "Property team updates monthly records"
  on public.monthly_records for update
  using (public.has_property_write_access(property_id));

create policy "Tenant reads own payments; property team reads theirs"
  on public.payments for select
  using (
    public.has_property_access(property_id)
    or tenant_id = public.my_tenant_id()
    or exists (
      select 1 from public.tenancies t
      where t.id = public.payments.tenancy_id
        and t.tenant_id = public.my_tenant_id()
    )
  );

create policy "Property team records payments"
  on public.payments for insert
  with check (public.has_property_write_access(property_id));

create policy "Property team updates payments"
  on public.payments for update
  using (public.has_property_write_access(property_id));

create policy "Tenant and property team read allocations"
  on public.payment_allocations for select
  using (
    exists (
      select 1 from public.payments p
      where p.id = public.payment_allocations.payment_id
        and (public.has_property_access(p.property_id)
             or p.tenant_id = public.my_tenant_id())
    )
  );

create policy "Property team writes allocations"
  on public.payment_allocations for insert
  with check (
    exists (
      select 1 from public.payments p
      where p.id = public.payment_allocations.payment_id
        and public.has_property_write_access(p.property_id)
    )
  );

create policy "Tenant reads own deposits; property team reads theirs"
  on public.advance_deposits for select
  using (
    exists (
      select 1 from public.tenancies t
      where t.id = public.advance_deposits.tenancy_id
        and (t.tenant_id = public.my_tenant_id()
             or public.has_property_access(t.property_id))
    )
  );

create policy "Property team writes deposits"
  on public.advance_deposits for insert
  with check (
    exists (
      select 1 from public.tenancies t
      where t.id = public.advance_deposits.tenancy_id
        and public.has_property_write_access(t.property_id)
    )
  );

create policy "Property team updates deposits"
  on public.advance_deposits for update
  using (
    exists (
      select 1 from public.tenancies t
      where t.id = public.advance_deposits.tenancy_id
        and public.has_property_write_access(t.property_id)
    )
  );

-- ============================================================================
-- expenses / meters / meter_readings
-- ============================================================================

create policy "Property team reads expenses"
  on public.expenses for select
  using (public.has_property_access(property_id));

create policy "Property team writes expenses"
  on public.expenses for insert
  with check (public.has_property_write_access(property_id));

create policy "Property team updates expenses"
  on public.expenses for update
  using (public.has_property_write_access(property_id));

create policy "Property team deletes expenses"
  on public.expenses for delete
  using (public.has_property_write_access(property_id));

create policy "Property team and current tenant read meters"
  on public.meters for select
  using (
    public.has_property_access(property_id)
    or exists (
      select 1 from public.tenancies t
      where t.flat_id = public.meters.flat_id
        and t.status = 'ACTIVE'
        and t.tenant_id = public.my_tenant_id()
    )
  );

create policy "Property team writes meters"
  on public.meters for insert
  with check (public.has_property_write_access(property_id));

create policy "Property team updates meters"
  on public.meters for update
  using (public.has_property_write_access(property_id));

create policy "Property team and current tenant read meter readings"
  on public.meter_readings for select
  using (
    exists (
      select 1 from public.meters m
      where m.id = public.meter_readings.meter_id
        and (
          public.has_property_access(m.property_id)
          or exists (
            select 1 from public.tenancies t
            where t.flat_id = m.flat_id
              and t.status = 'ACTIVE'
              and t.tenant_id = public.my_tenant_id()
          )
        )
    )
  );

create policy "Property team writes meter readings"
  on public.meter_readings for insert
  with check (
    exists (
      select 1 from public.meters m
      where m.id = public.meter_readings.meter_id
        and public.has_property_write_access(m.property_id)
    )
  );

-- ============================================================================
-- marketplace
-- ============================================================================

create policy "Published listings are publicly readable"
  on public.property_listings for select
  using (status = 'PUBLISHED');

create policy "Property team reads all their listings"
  on public.property_listings for select
  using (public.has_property_access(property_id));

create policy "Property team writes listings"
  on public.property_listings for insert
  with check (public.has_property_write_access(property_id));

create policy "Property team updates listings"
  on public.property_listings for update
  using (public.has_property_write_access(property_id));

create policy "Property team deletes listings"
  on public.property_listings for delete
  using (public.has_property_write_access(property_id));

create policy "Listing photos readable with their listing"
  on public.listing_photos for select
  using (
    exists (
      select 1 from public.property_listings l
      where l.id = public.listing_photos.listing_id
        and (l.status = 'PUBLISHED'
             or public.has_property_access(l.property_id))
    )
  );

create policy "Property team writes listing photos"
  on public.listing_photos for insert
  with check (
    exists (
      select 1 from public.property_listings l
      where l.id = public.listing_photos.listing_id
        and public.has_property_write_access(l.property_id)
    )
  );

create policy "Property team deletes listing photos"
  on public.listing_photos for delete
  using (
    exists (
      select 1 from public.property_listings l
      where l.id = public.listing_photos.listing_id
        and public.has_property_write_access(l.property_id)
    )
  );

create policy "Tenant manages own saved listings"
  on public.saved_listings for select
  using (
    tenant_id = public.my_tenant_id()
    or exists (
      select 1 from public.property_listings l
      where l.id = public.saved_listings.listing_id
        and public.has_property_access(l.property_id)
    )
  );

create policy "Tenant saves listings"
  on public.saved_listings for insert
  with check (tenant_id = public.my_tenant_id());

create policy "Tenant unsaves listings"
  on public.saved_listings for delete
  using (tenant_id = public.my_tenant_id());

create policy "Tenant and property team read interests"
  on public.tenant_interests for select
  using (
    tenant_id = public.my_tenant_id()
    or exists (
      select 1 from public.property_listings l
      where l.id = public.tenant_interests.listing_id
        and public.has_property_access(l.property_id)
    )
    or (property_id is not null
        and public.has_property_access(property_id))
  );

create policy "Tenant expresses interest"
  on public.tenant_interests for insert
  with check (tenant_id = public.my_tenant_id());

create policy "Property team manages interests"
  on public.tenant_interests for update
  using (
    exists (
      select 1 from public.property_listings l
      where l.id = public.tenant_interests.listing_id
        and public.has_property_write_access(l.property_id)
    )
    or (property_id is not null
        and public.has_property_write_access(property_id))
  );

create policy "Tenant and property team read visits"
  on public.property_visits for select
  using (
    tenant_id = public.my_tenant_id()
    or (property_id is not null
        and public.has_property_access(property_id))
  );

create policy "Tenant requests visits; property team manages them"
  on public.property_visits for insert
  with check (
    tenant_id = public.my_tenant_id()
    or (property_id is not null
        and public.has_property_write_access(property_id))
  );

create policy "Tenant and property team update visits"
  on public.property_visits for update
  using (
    tenant_id = public.my_tenant_id()
    or (property_id is not null
        and public.has_property_write_access(property_id))
  );

-- ============================================================================
-- maintenance
-- ============================================================================

create policy "Tenant and property team read maintenance requests"
  on public.maintenance_requests for select
  using (
    tenant_id = public.my_tenant_id()
    or public.has_property_access(property_id)
  );

create policy "Tenant reports; property team creates requests"
  on public.maintenance_requests for insert
  with check (
    tenant_id = public.my_tenant_id()
    or public.has_property_write_access(property_id)
  );

create policy "Tenant and property team update requests"
  on public.maintenance_requests for update
  using (
    tenant_id = public.my_tenant_id()
    or public.has_property_write_access(property_id)
  );

create policy "Property team reads workers"
  on public.maintenance_workers for select
  using (
    (property_id is not null and public.has_property_access(property_id))
    or (property_id is null
        and (exists (select 1 from public.properties p
                    where p.owner_id = auth.uid())
             or exists (select 1 from public.property_members pm
                       where pm.user_id = auth.uid()
                         and pm.role <> 'VIEWER')))
  );

create policy "Property team writes workers"
  on public.maintenance_workers for insert
  with check (
    (property_id is not null
     and public.has_property_write_access(property_id))
    or (property_id is null
        and (exists (select 1 from public.properties p
                    where p.owner_id = auth.uid())
             or exists (select 1 from public.property_members pm
                       where pm.user_id = auth.uid()
                         and pm.role <> 'VIEWER')))
  );

create policy "Property team updates workers"
  on public.maintenance_workers for update
  using (
    (property_id is not null
     and public.has_property_write_access(property_id))
    or (property_id is null
        and (exists (select 1 from public.properties p
                    where p.owner_id = auth.uid())
             or exists (select 1 from public.property_members pm
                       where pm.user_id = auth.uid()
                         and pm.role <> 'VIEWER')))
  );

create policy "Property team deletes workers"
  on public.maintenance_workers for delete
  using (
    (property_id is not null
     and public.has_property_write_access(property_id))
    or (property_id is null
        and (exists (select 1 from public.properties p
                    where p.owner_id = auth.uid())
             or exists (select 1 from public.property_members pm
                       where pm.user_id = auth.uid()
                         and pm.role <> 'VIEWER')))
  );

-- ============================================================================
-- rental_agreements
-- ============================================================================

create policy "Tenant and property team read agreements"
  on public.rental_agreements for select
  using (
    public.has_property_access(property_id)
    or exists (
      select 1 from public.tenancies t
      where t.id = public.rental_agreements.tenancy_id
        and t.tenant_id = public.my_tenant_id()
    )
  );

create policy "Property team writes agreements"
  on public.rental_agreements for insert
  with check (public.has_property_write_access(property_id));

create policy "Property team updates agreements"
  on public.rental_agreements for update
  using (public.has_property_write_access(property_id));

-- ============================================================================
-- notifications / preferences / logs / activity
-- ============================================================================

create policy "Users read own notifications"
  on public.notifications for select
  using (user_id = auth.uid());

create policy "Users manage own notifications"
  on public.notifications for update
  using (user_id = auth.uid());

create policy "Users delete own notifications"
  on public.notifications for delete
  using (user_id = auth.uid());

create policy "Users read own preferences"
  on public.notification_preferences for select
  using (user_id = auth.uid());

create policy "Users write own preferences"
  on public.notification_preferences for insert
  with check (user_id = auth.uid());

create policy "Users update own preferences"
  on public.notification_preferences for update
  using (user_id = auth.uid());

create policy "Users read own notification logs"
  on public.notification_logs for select
  using (user_id = auth.uid());
-- No insert/update/delete policies: delivery logging is service-role only.

create policy "Actors and property team read activity logs"
  on public.activity_logs for select
  using (
    auth.uid() = actor_id
    or (property_id is not null
        and public.has_property_access(property_id))
  );

create policy "Authenticated users write activity logs"
  on public.activity_logs for insert
  with check (auth.role() = 'authenticated');
