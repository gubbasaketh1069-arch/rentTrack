-- ============================================================================
-- RentTrack migration 009 — added features B:
--   1. upi_mandates table (UPI autopay / e-mandate architecture)
--   2. PG / co-living mode: flats.is_pg, flats.bed_count, tenancies.bed_number
--      + per-bed uniqueness for PG flats (one_active_tenancy_per_bed)
--   3. Shared meter splitting: meters.is_shared + meter_splits history table
--
-- Run in the Supabase SQL editor AFTER 001–008.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. UPI mandates (autopay / e-mandate)
-- ----------------------------------------------------------------------------
create table if not exists public.upi_mandates (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id),
  property_id        uuid not null references public.properties (id) on delete cascade,
  tenancy_id         uuid references public.tenancies (id) on delete set null,
  provider           text not null
                     check (provider in ('RAZORPAY', 'STRIPE', 'OTHER')),
  external_mandate_id text,
  upi_id             text not null,
  max_amount         numeric(12, 2) not null check (max_amount > 0),
  frequency          text not null default 'MONTHLY'
                     check (frequency in ('MONTHLY')),
  status             text not null default 'PENDING_SETUP'
                     check (status in ('PENDING_SETUP', 'ACTIVE', 'PAUSED', 'CANCELLED', 'FAILED')),
  next_debit_date    date,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.upi_mandates is
  'UPI autopay mandates. Rows stay PENDING_SETUP until a payment provider is connected; no mandate is ever marked ACTIVE without provider confirmation.';
comment on column public.upi_mandates.external_mandate_id is
  'Provider-side mandate id (Razorpay/Stripe). Set only after a successful provider call.';

alter table public.upi_mandates enable row level security;

-- Property team (write access) manages mandates for their properties.
drop policy if exists "Property team manages mandates"
  on public.upi_mandates;
create policy "Property team manages mandates"
  on public.upi_mandates for all
  using (public.has_property_write_access(property_id))
  with check (public.has_property_write_access(property_id));

-- Tenants read their own mandates.
drop policy if exists "Tenant reads own mandates"
  on public.upi_mandates;
create policy "Tenant reads own mandates"
  on public.upi_mandates for select
  using (tenant_id = public.my_tenant_id());

-- ----------------------------------------------------------------------------
-- 2. PG / co-living mode
-- ----------------------------------------------------------------------------
alter table public.flats
  add column if not exists is_pg boolean not null default false;

alter table public.flats
  add column if not exists bed_count integer not null default 0
  check (bed_count >= 0);

alter table public.tenancies
  add column if not exists bed_number integer
  check (bed_number is null or bed_number > 0);

comment on column public.flats.is_pg is
  'PG / co-living mode: the flat rents by bed instead of as one unit.';
comment on column public.flats.bed_count is
  'Number of beds when is_pg is true. The flat is OCCUPIED only when every bed has an active tenancy.';
comment on column public.tenancies.bed_number is
  'Bed number within a PG flat (1..bed_count). Null for normal flats.';

-- Per-bed uniqueness for PG flats; the original flat-level rule keeps
-- applying to normal flats (bed_number is null there).
drop index if exists public.one_active_tenancy_per_flat;

create unique index one_active_tenancy_per_flat
  on public.tenancies (flat_id)
  where status = 'ACTIVE' and flat_id is not null and bed_number is null;

create unique index one_active_tenancy_per_bed
  on public.tenancies (flat_id, bed_number)
  where status = 'ACTIVE' and flat_id is not null and bed_number is not null;

comment on index public.one_active_tenancy_per_bed is
  'PG mode: one active tenancy per bed — the same bed cannot be double-booked.';

-- ----------------------------------------------------------------------------
-- 3. Shared meter splitting
-- ----------------------------------------------------------------------------
alter table public.meters
  add column if not exists is_shared boolean not null default false;

comment on column public.meters.is_shared is
  'A shared meter serves several flats; its bill is split via meter_splits.';

create table if not exists public.meter_splits (
  id          uuid primary key default gen_random_uuid(),
  meter_id    uuid not null references public.meters (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  year        integer not null,
  month       integer not null check (month between 1 and 12),
  total_amount numeric(12, 2) not null check (total_amount >= 0),
  bill_kind   text not null check (bill_kind in ('ELECTRICITY', 'BORE')),
  -- JSON array of {flat_id, tenancy_id, share_amount, method, basis}
  -- method: 'equal' | 'ratio' | 'units'
  shares      jsonb not null default '[]'::jsonb,
  status      text not null default 'PENDING'
              check (status in ('PENDING', 'APPLIED', 'CANCELLED')),
  notes       text,
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now()
);

comment on table public.meter_splits is
  'History of shared-meter bill splits. Shares land on each target tenancy''s next monthly record; PENDING splits are suggested when that record is created.';

alter table public.meter_splits enable row level security;

-- Property team (any access) reads; write access manages.
drop policy if exists "Property team reads meter splits"
  on public.meter_splits;
create policy "Property team reads meter splits"
  on public.meter_splits for select
  using (public.has_property_access(property_id));

drop policy if exists "Property team manages meter splits"
  on public.meter_splits;
create policy "Property team manages meter splits"
  on public.meter_splits for all
  using (public.has_property_write_access(property_id))
  with check (public.has_property_write_access(property_id));
