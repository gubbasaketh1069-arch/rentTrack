-- ============================================================================
-- RentTrack migration 006 — maintenance extras + notification self-insert
-- ============================================================================
-- 1. Owner notes on maintenance requests.
-- 2. maintenance_request_photos: photo references for the private
--    `maintenance-images` bucket (path convention <property_id>/<file>).
-- 3. maintenance_status_history: every status transition, so owners and
--    tenants see an honest timeline.
-- 4. Lets the app insert notification rows for the signed-in user only
--    (needed for agreement-expiry reminders; delivery is a later phase).
--
-- Run in the Supabase SQL editor AFTER 001-005.

-- ----------------------------------------------------------------------------
-- 1. Owner notes
-- ----------------------------------------------------------------------------
alter table public.maintenance_requests
  add column if not exists owner_notes text;

-- ----------------------------------------------------------------------------
-- 2. Request photos
-- ----------------------------------------------------------------------------
create table if not exists public.maintenance_request_photos (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.maintenance_requests (id) on delete cascade,
  storage_path text not null,
  file_name    text,
  created_at   timestamptz not null default now()
);

create index if not exists maintenance_request_photos_request_id_idx
  on public.maintenance_request_photos (request_id);

alter table public.maintenance_request_photos enable row level security;

drop policy if exists "Request parties read photos" on public.maintenance_request_photos;
create policy "Request parties read photos"
  on public.maintenance_request_photos for select
  using (
    exists (
      select 1 from public.maintenance_requests r
      where r.id = public.maintenance_request_photos.request_id
        and (r.tenant_id = public.my_tenant_id()
             or public.has_property_access(r.property_id))
    )
  );

drop policy if exists "Tenant and property team add photos" on public.maintenance_request_photos;
create policy "Tenant and property team add photos"
  on public.maintenance_request_photos for insert
  with check (
    exists (
      select 1 from public.maintenance_requests r
      where r.id = public.maintenance_request_photos.request_id
        and (r.tenant_id = public.my_tenant_id()
             or public.has_property_write_access(r.property_id))
    )
  );

drop policy if exists "Property team deletes photos" on public.maintenance_request_photos;
create policy "Property team deletes photos"
  on public.maintenance_request_photos for delete
  using (
    exists (
      select 1 from public.maintenance_requests r
      where r.id = public.maintenance_request_photos.request_id
        and public.has_property_write_access(r.property_id)
    )
  );

-- ----------------------------------------------------------------------------
-- 3. Status history
-- ----------------------------------------------------------------------------
create table if not exists public.maintenance_status_history (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.maintenance_requests (id) on delete cascade,
  from_status text,
  to_status   text not null,
  changed_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now()
);

create index if not exists maintenance_status_history_request_id_idx
  on public.maintenance_status_history (request_id);

alter table public.maintenance_status_history enable row level security;

drop policy if exists "Request parties read status history" on public.maintenance_status_history;
create policy "Request parties read status history"
  on public.maintenance_status_history for select
  using (
    exists (
      select 1 from public.maintenance_requests r
      where r.id = public.maintenance_status_history.request_id
        and (r.tenant_id = public.my_tenant_id()
             or public.has_property_access(r.property_id))
    )
  );

drop policy if exists "Request parties write status history" on public.maintenance_status_history;
create policy "Request parties write status history"
  on public.maintenance_status_history for insert
  with check (
    exists (
      select 1 from public.maintenance_requests r
      where r.id = public.maintenance_status_history.request_id
        and (r.tenant_id = public.my_tenant_id()
             or public.has_property_write_access(r.property_id))
    )
  );

-- ----------------------------------------------------------------------------
-- 4. Notifications: the app may insert rows for the signed-in user only.
-- ----------------------------------------------------------------------------
drop policy if exists "Users create own notifications" on public.notifications;
create policy "Users create own notifications"
  on public.notifications for insert
  with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 5. Storage: a tenant may read their own agreement document.
--    (The existing bucket policy only covers the property team.)
-- ----------------------------------------------------------------------------
drop policy if exists "Tenant reads own agreement document" on storage.objects;
create policy "Tenant reads own agreement document"
  on storage.objects for select
  using (
    bucket_id = 'rental-agreements'
    and exists (
      select 1
      from public.rental_agreements ra
      join public.tenancies t on t.id = ra.tenancy_id
      where ra.document_path = storage.objects.name
        and t.tenant_id = public.my_tenant_id()
    )
  );
