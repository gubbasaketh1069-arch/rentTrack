-- ============================================================================
-- RentTrack migration 001 — core schema
-- ============================================================================
-- Creates every RentTrack table with exact names from the master context
-- (spec section 59). Note: the spec says "28 core tables" but lists 32
-- names; all 32 listed names are created here — names are authoritative.
--
-- Conventions:
--   * timestamptz created_at / updated_at on every table (updated_at kept
--     fresh by trigger)
--   * effective_date is distinct from created_at wherever history matters
--   * money columns are numeric(12,2)
--   * history is never deleted: statuses / end dates instead of DELETE
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- updated_at trigger
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- CORE: profiles → properties → floors → flats
-- ============================================================================

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text,
  full_name     text,
  phone         text,
  role          text not null default 'OWNER'
                check (role in ('OWNER', 'TENANT')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.profiles is 'App users. OWNER manages properties; TENANT uses the tenant portal.';

create table public.properties (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles (id),
  name            text not null,
  property_type   text,
  address         text,
  area            text,
  locality        text,
  landmark        text,
  city            text,
  state           text,
  pincode         text,
  description     text,
  floor_structure text,
  notes           text,
  effective_date  date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.properties is 'A property owned by a profile. Info may change; history lives in child tables.';

create table public.property_members (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        text not null
              check (role in ('PRIMARY_OWNER', 'CO_OWNER', 'MANAGER', 'EDITOR', 'VIEWER')),
  created_at  timestamptz not null default now(),
  unique (property_id, user_id)
);
comment on table public.property_members is 'Shared access to one property. All members work on the SAME records — never duplicated.';

create table public.property_invitations (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  email       text not null,
  role        text not null
              check (role in ('PRIMARY_OWNER', 'CO_OWNER', 'MANAGER', 'EDITOR', 'VIEWER')),
  status      text not null default 'PENDING'
              check (status in ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED')),
  invited_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.floors (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  name        text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (property_id, name)
);
comment on table public.floors is 'Supports G / G+1 / G+2 … as well as custom floor names.';

create table public.flats (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties (id) on delete cascade,
  floor_id     uuid references public.floors (id) on delete set null,
  flat_number  text not null,
  bhk_type     text,
  room_type    text,
  rent         numeric(12, 2) not null default 0,
  deposit      numeric(12, 2) not null default 0,
  maintenance  numeric(12, 2) not null default 0,
  status       text not null default 'AVAILABLE'
               check (status in ('AVAILABLE', 'OCCUPIED', 'NOTICE_PERIOD', 'MAINTENANCE')),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (property_id, flat_number)
);

create table public.flat_features (
  id         uuid primary key default gen_random_uuid(),
  flat_id    uuid not null references public.flats (id) on delete cascade,
  feature    text not null,
  created_at timestamptz not null default now(),
  unique (flat_id, feature)
);
comment on table public.flat_features is 'Flat amenities; also used by the tenant Find-a-Flat search.';

-- ============================================================================
-- TENANTS: tenants → tenancies, family, phones, documents
-- ============================================================================

create table public.tenants (
  id            uuid primary key default gen_random_uuid(),
  -- Linked login is optional: a tenant exists before they ever sign in.
  user_id       uuid references public.profiles (id) on delete set null,
  full_name     text not null,
  primary_phone text,
  address       text,
  occupation    text,
  place_of_work text,
  notes         text,
  -- Who created this record. Lets the creator read/update it via RLS even
  -- before the first tenancy exists (so insert...returning works in the
  -- standard Add-Tenant flow: tenant row first, tenancy row second).
  created_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.tenants is 'A PERSON. Never duplicated: moving flats creates a new tenancy, not a new tenant.';

create table public.phone_numbers (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  phone      text not null,
  label      text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.tenancies (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id),
  property_id uuid not null references public.properties (id) on delete cascade,
  flat_id     uuid references public.flats (id),
  start_date  date not null,
  end_date    date,
  status      text not null default 'ACTIVE'
              check (status in ('ACTIVE', 'ENDED', 'CANCELLED')),
  entry_notes text,
  exit_notes  text,
  exit_reason text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.tenancies is 'THE link between a tenant and a flat. Current occupancy is derived from the ACTIVE tenancy.';

-- Business rule: a flat must not have more than one ACTIVE tenancy.
create unique index one_active_tenancy_per_flat
  on public.tenancies (flat_id)
  where status = 'ACTIVE' and flat_id is not null;

create table public.family_members (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  name             text not null,
  relationship     text,
  dob              date,
  age              integer,
  occupation       text,
  phone            text,
  -- Sensitive: stored encrypted-at-rest; the app masks display (XXXX XXXX 1234).
  aadhaar_number   text,
  aadhaar_front_path text,
  aadhaar_back_path  text,
  joined_date      date,
  left_date        date,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.documents (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid references public.tenants (id) on delete cascade,
  family_member_id uuid references public.family_members (id) on delete cascade,
  doc_type         text not null,
  -- Reference into a PRIVATE storage bucket. Never a public URL.
  storage_path     text not null,
  file_name        text,
  mime_type        text,
  created_at       timestamptz not null default now(),
  check (tenant_id is not null or family_member_id is not null)
);

-- ============================================================================
-- RENT: history, monthly records, payments, allocations, advances
-- ============================================================================

create table public.rent_history (
  id            uuid primary key default gen_random_uuid(),
  tenancy_id    uuid references public.tenancies (id),
  flat_id       uuid references public.flats (id),
  old_rent      numeric(12, 2),
  new_rent      numeric(12, 2) not null,
  effective_date date not null,
  reason        text,
  notes         text,
  changed_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  check (tenancy_id is not null or flat_id is not null)
);
comment on table public.rent_history is 'Immutable rent-change log. Changing current rent never rewrites old monthly records.';

create table public.monthly_records (
  id              uuid primary key default gen_random_uuid(),
  tenancy_id      uuid not null references public.tenancies (id),
  property_id     uuid not null references public.properties (id) on delete cascade,
  flat_id         uuid references public.flats (id),
  month           integer not null check (month between 1 and 12),
  year            integer not null,
  applicable_rent numeric(12, 2) not null default 0,
  maintenance     numeric(12, 2) not null default 0,
  current_bill    numeric(12, 2) not null default 0,
  bore_bill       numeric(12, 2) not null default 0,
  cleaning        numeric(12, 2) not null default 0,
  other_charges   numeric(12, 2) not null default 0,
  previous_due    numeric(12, 2) not null default 0,
  -- total_payable = previous_due + applicable_rent + maintenance +
  --                 current_bill + bore_bill + cleaning + other_charges
  -- (previous_due is carried, never double counted)
  total_payable   numeric(12, 2) not null default 0,
  total_paid      numeric(12, 2) not null default 0,
  remaining_due   numeric(12, 2) not null default 0,
  status          text not null default 'DUE'
                  check (status in ('PAID', 'PARTIAL', 'LATE_DUE', 'DUE')),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenancy_id, year, month)
);
comment on table public.monthly_records is 'One billing record per tenancy per month. Totals are maintained by the application/edge functions.';

create table public.payments (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid references public.tenants (id),
  property_id      uuid references public.properties (id),
  flat_id          uuid references public.flats (id),
  tenancy_id       uuid references public.tenancies (id),
  monthly_record_id uuid references public.monthly_records (id),
  amount           numeric(12, 2) not null check (amount > 0),
  method           text not null
                   check (method in ('CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'OTHER')),
  payment_date     date not null default current_date,
  transaction_id   text,
  status           text not null default 'SUCCESS'
                   check (status in ('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED')),
  notes            text,
  recorded_by      uuid references public.profiles (id),
  created_at       timestamptz not null default now()
);
comment on table public.payments is 'Insert-only payment ledger. Corrections are new rows (e.g. REFUNDED), never overwrites.';

create table public.payment_allocations (
  id         uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete cascade,
  category   text not null
             check (category in ('PREVIOUS_DUE', 'CURRENT_RENT', 'CURRENT_BILL',
                                 'MAINTENANCE', 'BORE', 'CLEANING', 'OTHER')),
  amount     numeric(12, 2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (payment_id, category)
);
comment on table public.payment_allocations is 'How a payment was split. Allocation order: previous due → rent → current → maintenance → bore → cleaning → other.';

create table public.advance_deposits (
  id              uuid primary key default gen_random_uuid(),
  tenancy_id      uuid not null references public.tenancies (id),
  agreed_amount   numeric(12, 2) not null default 0,
  amount_received numeric(12, 2) not null default 0,
  received_date   date,
  method          text,
  refunded_amount numeric(12, 2) not null default 0,
  refund_date     date,
  adjusted_amount numeric(12, 2) not null default 0,
  status          text not null default 'PENDING'
                  check (status in ('RECEIVED', 'PARTIALLY_RECEIVED', 'REFUNDED',
                                    'PARTIALLY_REFUNDED', 'ADJUSTED', 'PENDING')),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.advance_deposits is 'Security deposit. Strictly separate from monthly rent payable.';

-- ============================================================================
-- FINANCE: expenses, meters, meter readings
-- ============================================================================

create table public.expenses (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  flat_id     uuid references public.flats (id),
  date        date not null,
  category    text not null
              check (category in ('Repairs', 'Plumbing', 'Electrical', 'Cleaning',
                                  'Maintenance', 'Property Tax', 'Other')),
  amount      numeric(12, 2) not null check (amount >= 0),
  description text,
  receipt_path text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.expenses is 'Owner-side expenses. Separate from tenant rent payments.';

create table public.meters (
  id            uuid primary key default gen_random_uuid(),
  flat_id       uuid not null references public.flats (id) on delete cascade,
  property_id   uuid references public.properties (id) on delete cascade,
  type          text not null check (type in ('ELECTRICITY', 'BORE')),
  meter_number  text,
  usc           text,
  serial_number text,
  start_date    date,
  end_date      date,
  is_current    boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.meters is 'Replaced meters stay in history; historical bills show the meter that was applicable that month.';

create table public.meter_readings (
  id               uuid primary key default gen_random_uuid(),
  meter_id         uuid not null references public.meters (id) on delete cascade,
  previous_reading numeric(12, 2),
  current_reading  numeric(12, 2),
  units_used       numeric(12, 2)
                   generated always as (current_reading - previous_reading) stored,
  reading_date     date not null,
  created_at       timestamptz not null default now()
);

-- ============================================================================
-- MARKETPLACE: listings, photos, saved, interests, visits
-- ============================================================================

create table public.property_listings (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid references public.properties (id) on delete cascade,
  flat_id       uuid references public.flats (id),
  title         text not null,
  description   text,
  rent          numeric(12, 2),
  deposit       numeric(12, 2),
  maintenance   numeric(12, 2),
  status        text not null default 'DRAFT'
                check (status in ('DRAFT', 'PUBLISHED', 'PAUSED', 'FEATURED', 'RENTED', 'EXPIRED')),
  available_from date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.property_listings is 'When a flat becomes occupied the listing flips to RENTED and leaves active search.';

create table public.listing_photos (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.property_listings (id) on delete cascade,
  storage_path text not null,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

create table public.saved_listings (
  id         uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.property_listings (id) on delete cascade,
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (listing_id, tenant_id)
);

create table public.tenant_interests (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid references public.property_listings (id),
  property_id uuid references public.properties (id),
  flat_id     uuid references public.flats (id),
  tenant_id   uuid references public.tenants (id),
  budget      numeric(12, 2),
  move_in_date date,
  message     text,
  status      text not null default 'NEW'
              check (status in ('NEW', 'CONTACTED', 'VISIT_SCHEDULED', 'VISITED',
                                'INTERESTED', 'REJECTED', 'CONVERTED')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.tenant_interests is 'Conversion reuses the existing tenant record — never creates a duplicate.';

create table public.property_visits (
  id          uuid primary key default gen_random_uuid(),
  interest_id uuid references public.tenant_interests (id),
  listing_id  uuid references public.property_listings (id),
  tenant_id   uuid references public.tenants (id),
  property_id uuid references public.properties (id),
  visit_date  timestamptz,
  status      text not null default 'REQUESTED'
              check (status in ('REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED')),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================================
-- MAINTENANCE
-- ============================================================================

create table public.maintenance_workers (
  id          uuid primary key default gen_random_uuid(),
  -- Nullable: an owner-level worker list shared across their properties.
  property_id uuid references public.properties (id) on delete cascade,
  name        text not null,
  phone       text,
  service     text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.maintenance_requests (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references public.tenants (id),
  property_id uuid references public.properties (id) on delete cascade,
  flat_id     uuid references public.flats (id),
  category    text not null
              check (category in ('Electricity', 'Water', 'Plumbing', 'Bathroom',
                                  'Kitchen', 'Fan', 'Door', 'Leakage', 'Other')),
  description text,
  status      text not null default 'OPEN'
              check (status in ('OPEN', 'ACCEPTED', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED')),
  worker_id   uuid references public.maintenance_workers (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================================
-- AGREEMENTS
-- ============================================================================

create table public.rental_agreements (
  id            uuid primary key default gen_random_uuid(),
  tenancy_id    uuid not null references public.tenancies (id),
  property_id   uuid references public.properties (id),
  flat_id       uuid references public.flats (id),
  start_date    date,
  end_date      date,
  document_path text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================

create table public.notifications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references public.profiles (id) on delete cascade,
  title          text not null,
  body           text,
  type           text,
  related_entity text,
  related_id     uuid,
  is_read        boolean not null default false,
  created_at     timestamptz not null default now()
);
comment on table public.notifications is 'Never include Aadhaar data in notifications.';

create table public.notification_preferences (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null unique references public.profiles (id) on delete cascade,
  rent_reminders     boolean not null default true,
  payment_alerts     boolean not null default true,
  maintenance_updates boolean not null default true,
  marketing          boolean not null default false,
  updated_at         timestamptz not null default now()
);

create table public.notification_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles (id),
  channel    text,
  template   text,
  payload    jsonb,
  status     text,
  sent_at    timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.notification_logs is 'Delivery log for SMS/WhatsApp/email/push. Prevents duplicate sends.';

-- ============================================================================
-- AUDIT
-- ============================================================================

create table public.activity_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles (id),
  property_id uuid references public.properties (id) on delete cascade,
  action      text not null,
  entity      text,
  entity_id   uuid,
  old_value   jsonb,
  new_value   jsonb,
  created_at  timestamptz not null default now()
);
comment on table public.activity_logs is 'Who did what, to which entity, when.';

-- ============================================================================
-- INDEXES (foreign keys + common filters)
-- ============================================================================

create index idx_properties_owner on public.properties (owner_id);
create index idx_property_members_property on public.property_members (property_id);
create index idx_property_members_user on public.property_members (user_id);
create index idx_property_invitations_property on public.property_invitations (property_id);
create index idx_floors_property on public.floors (property_id);
create index idx_flats_property on public.flats (property_id);
create index idx_flats_property_status on public.flats (property_id, status);
create index idx_flats_floor on public.flats (floor_id);
create index idx_flat_features_flat on public.flat_features (flat_id);
create index idx_tenants_user on public.tenants (user_id);
create index idx_tenants_created_by on public.tenants (created_by);
create index idx_phone_numbers_tenant on public.phone_numbers (tenant_id);
create index idx_tenancies_tenant on public.tenancies (tenant_id);
create index idx_tenancies_property on public.tenancies (property_id);
create index idx_tenancies_flat on public.tenancies (flat_id);
create index idx_tenancies_active on public.tenancies (flat_id) where status = 'ACTIVE';
create index idx_family_members_tenant on public.family_members (tenant_id);
create index idx_documents_tenant on public.documents (tenant_id);
create index idx_rent_history_tenancy on public.rent_history (tenancy_id);
create index idx_rent_history_flat on public.rent_history (flat_id);
create index idx_monthly_records_tenancy on public.monthly_records (tenancy_id);
create index idx_monthly_records_property_month on public.monthly_records (property_id, year, month);
create index idx_payments_tenant on public.payments (tenant_id);
create index idx_payments_property on public.payments (property_id);
create index idx_payments_monthly_record on public.payments (monthly_record_id);
create index idx_payments_date on public.payments (payment_date);
create index idx_payment_allocations_payment on public.payment_allocations (payment_id);
create index idx_advance_deposits_tenancy on public.advance_deposits (tenancy_id);
create index idx_expenses_property on public.expenses (property_id);
create index idx_expenses_date on public.expenses (date);
create index idx_meters_flat on public.meters (flat_id);
create index idx_meter_readings_meter on public.meter_readings (meter_id);
create index idx_listings_property on public.property_listings (property_id);
create index idx_listings_status on public.property_listings (status);
create index idx_listing_photos_listing on public.listing_photos (listing_id);
create index idx_saved_listings_tenant on public.saved_listings (tenant_id);
create index idx_tenant_interests_listing on public.tenant_interests (listing_id);
create index idx_tenant_interests_tenant on public.tenant_interests (tenant_id);
create index idx_property_visits_property on public.property_visits (property_id);
create index idx_maintenance_requests_property on public.maintenance_requests (property_id);
create index idx_maintenance_requests_status on public.maintenance_requests (property_id, status);
create index idx_maintenance_requests_tenant on public.maintenance_requests (tenant_id);
create index idx_rental_agreements_tenancy on public.rental_agreements (tenancy_id);
create index idx_notifications_user on public.notifications (user_id);
create index idx_notification_logs_user on public.notification_logs (user_id);
create index idx_activity_logs_property on public.activity_logs (property_id);
create index idx_activity_logs_actor on public.activity_logs (actor_id);

-- ============================================================================
-- updated_at triggers
-- ============================================================================

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'profiles', 'properties', 'property_invitations', 'floors', 'flats',
      'tenants', 'tenancies', 'family_members', 'monthly_records',
      'advance_deposits', 'expenses', 'meters', 'property_listings',
      'tenant_interests', 'property_visits', 'maintenance_requests',
      'maintenance_workers', 'rental_agreements', 'notification_preferences'
    ])
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      t
    );
  end loop;
end;
$$;
