-- ============================================================================
-- RentTrack migration 003 — storage buckets and policies
-- ============================================================================
-- Buckets (spec section 64). Sensitive buckets are private; only
-- property-images and listing-images are publicly readable.
--
-- Path conventions (enforced by the policies below):
--   aadhaar-documents / tenant-documents : <tenant_id>/<file>
--   rental-agreements                     : <property_id>/<file>
--   property-images / listing-images      : <property_id>/<file> (public read)
--   payment-receipts / expense-receipts   : <property_id>/<file>
--   maintenance-images                    : <property_id>/<file>
--
-- Aadhaar images are NEVER public and never appear in listings, SMS, or
-- exports (spec section 13). Private documents are never mixed with public
-- listing images (spec section 46).
-- ============================================================================

insert into storage.buckets (id, name, public)
values
  ('aadhaar-documents',  'aadhaar-documents',  false),
  ('tenant-documents',   'tenant-documents',   false),
  ('rental-agreements',  'rental-agreements',  false),
  ('property-images',    'property-images',    true),
  ('listing-images',     'listing-images',     true),
  ('payment-receipts',   'payment-receipts',   false),
  ('expense-receipts',   'expense-receipts',   false),
  ('maintenance-images', 'maintenance-images', false)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------

-- Safely extract the first path segment as a property uuid (null on garbage).
create or replace function public.storage_property_id(p_path text)
returns uuid
language plpgsql stable security definer
set search_path = public
as $$
declare
  v uuid;
begin
  v := split_part(p_path, '/', 1)::uuid;
  return v;
exception
  when others then
    return null;
end;
$$;

-- Safely extract the first path segment as a tenant uuid (null on garbage).
create or replace function public.storage_tenant_id(p_path text)
returns uuid
language plpgsql stable security definer
set search_path = public
as $$
declare
  v uuid;
begin
  v := split_part(p_path, '/', 1)::uuid;
  return v;
exception
  when others then
    return null;
end;
$$;

-- Tenant themself, or property team with a tenancy link to that tenant.
create or replace function public.can_access_tenant_docs(p_tenant_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select p_tenant_id = public.my_tenant_id()
      or exists (
        select 1 from public.tenancies t
        where t.tenant_id = p_tenant_id
          and public.has_property_access(t.property_id)
      );
$$;

-- Property team with write access and a tenancy link to that tenant.
create or replace function public.can_write_tenant_docs(p_tenant_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tenancies t
    where t.tenant_id = p_tenant_id
      and public.has_property_write_access(t.property_id)
  );
$$;

-- Tenant with an ACTIVE tenancy inside a property (for maintenance uploads).
create or replace function public.tenant_in_property(p_property_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tenancies t
    where t.property_id = p_property_id
      and t.status = 'ACTIVE'
      and t.tenant_id = public.my_tenant_id()
  );
$$;

-- ============================================================================
-- aadhaar-documents (private)
-- ============================================================================

create policy "Tenant and property team read aadhaar documents"
  on storage.objects for select
  using (
    bucket_id = 'aadhaar-documents'
    and public.can_access_tenant_docs(public.storage_tenant_id(name))
  );

create policy "Tenant self-uploads; property team writes aadhaar documents"
  on storage.objects for insert
  with check (
    bucket_id = 'aadhaar-documents'
    and (
      public.storage_tenant_id(name) = public.my_tenant_id()
      or public.can_write_tenant_docs(public.storage_tenant_id(name))
    )
  );

create policy "Property team updates aadhaar documents"
  on storage.objects for update
  using (
    bucket_id = 'aadhaar-documents'
    and public.can_write_tenant_docs(public.storage_tenant_id(name))
  );

create policy "Property team deletes aadhaar documents"
  on storage.objects for delete
  using (
    bucket_id = 'aadhaar-documents'
    and public.can_write_tenant_docs(public.storage_tenant_id(name))
  );

-- ============================================================================
-- tenant-documents (private)
-- ============================================================================

create policy "Tenant and property team read tenant documents"
  on storage.objects for select
  using (
    bucket_id = 'tenant-documents'
    and public.can_access_tenant_docs(public.storage_tenant_id(name))
  );

create policy "Tenant self-uploads; property team writes tenant documents"
  on storage.objects for insert
  with check (
    bucket_id = 'tenant-documents'
    and (
      public.storage_tenant_id(name) = public.my_tenant_id()
      or public.can_write_tenant_docs(public.storage_tenant_id(name))
    )
  );

create policy "Property team updates tenant documents"
  on storage.objects for update
  using (
    bucket_id = 'tenant-documents'
    and public.can_write_tenant_docs(public.storage_tenant_id(name))
  );

create policy "Property team deletes tenant documents"
  on storage.objects for delete
  using (
    bucket_id = 'tenant-documents'
    and public.can_write_tenant_docs(public.storage_tenant_id(name))
  );

-- ============================================================================
-- rental-agreements (private, property-scoped)
-- ============================================================================

create policy "Property team reads rental agreements"
  on storage.objects for select
  using (
    bucket_id = 'rental-agreements'
    and public.has_property_access(public.storage_property_id(name))
  );

create policy "Property team writes rental agreements"
  on storage.objects for insert
  with check (
    bucket_id = 'rental-agreements'
    and public.has_property_write_access(public.storage_property_id(name))
  );

create policy "Property team updates rental agreements"
  on storage.objects for update
  using (
    bucket_id = 'rental-agreements'
    and public.has_property_write_access(public.storage_property_id(name))
  );

create policy "Property team deletes rental agreements"
  on storage.objects for delete
  using (
    bucket_id = 'rental-agreements'
    and public.has_property_write_access(public.storage_property_id(name))
  );

-- ============================================================================
-- property-images / listing-images (public read)
-- ============================================================================

create policy "Property images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'property-images');

create policy "Property team writes property images"
  on storage.objects for insert
  with check (
    bucket_id = 'property-images'
    and public.has_property_write_access(public.storage_property_id(name))
  );

create policy "Property team deletes property images"
  on storage.objects for delete
  using (
    bucket_id = 'property-images'
    and public.has_property_write_access(public.storage_property_id(name))
  );

create policy "Listing images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'listing-images');

create policy "Property team writes listing images"
  on storage.objects for insert
  with check (
    bucket_id = 'listing-images'
    and public.has_property_write_access(public.storage_property_id(name))
  );

create policy "Property team deletes listing images"
  on storage.objects for delete
  using (
    bucket_id = 'listing-images'
    and public.has_property_write_access(public.storage_property_id(name))
  );

-- ============================================================================
-- payment-receipts / expense-receipts (private, property-scoped)
-- ============================================================================

create policy "Property team reads payment receipts"
  on storage.objects for select
  using (
    bucket_id = 'payment-receipts'
    and public.has_property_access(public.storage_property_id(name))
  );

create policy "Property team writes payment receipts"
  on storage.objects for insert
  with check (
    bucket_id = 'payment-receipts'
    and public.has_property_write_access(public.storage_property_id(name))
  );

create policy "Property team deletes payment receipts"
  on storage.objects for delete
  using (
    bucket_id = 'payment-receipts'
    and public.has_property_write_access(public.storage_property_id(name))
  );

create policy "Property team reads expense receipts"
  on storage.objects for select
  using (
    bucket_id = 'expense-receipts'
    and public.has_property_access(public.storage_property_id(name))
  );

create policy "Property team writes expense receipts"
  on storage.objects for insert
  with check (
    bucket_id = 'expense-receipts'
    and public.has_property_write_access(public.storage_property_id(name))
  );

create policy "Property team deletes expense receipts"
  on storage.objects for delete
  using (
    bucket_id = 'expense-receipts'
    and public.has_property_write_access(public.storage_property_id(name))
  );

-- ============================================================================
-- maintenance-images (private; property team + reporting tenant)
-- ============================================================================

create policy "Property team and tenant read maintenance images"
  on storage.objects for select
  using (
    bucket_id = 'maintenance-images'
    and (
      public.has_property_access(public.storage_property_id(name))
      or public.tenant_in_property(public.storage_property_id(name))
    )
  );

create policy "Property team and tenant upload maintenance images"
  on storage.objects for insert
  with check (
    bucket_id = 'maintenance-images'
    and (
      public.has_property_write_access(public.storage_property_id(name))
      or public.tenant_in_property(public.storage_property_id(name))
    )
  );

create policy "Property team deletes maintenance images"
  on storage.objects for delete
  using (
    bucket_id = 'maintenance-images'
    and public.has_property_write_access(public.storage_property_id(name))
  );
