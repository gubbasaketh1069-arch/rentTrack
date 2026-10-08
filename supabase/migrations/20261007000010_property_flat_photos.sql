-- RentTrack migration 010 — property + flat photo galleries
--
-- Owner uploads property/flat photos at creation/edit time; tenants see them
-- on Find-a-Flat. Photos are plain `photos text[]` columns (ordered storage
-- paths, first entry = cover).
--
-- STORAGE: reuses the existing PUBLIC 'property-images' bucket (migration
-- 003) — the same public-read pattern as listing photos ('listing-images').
--   Property photos: <property_id>/<uuid>.<ext>
--   Flat photos:     <property_id>/flats/<flat_id>/<uuid>.<ext>
-- The first path segment is always the property UUID, so the existing
-- 'property-images' storage policies apply unchanged:
--   - public read (anyone with the URL)
--   - property-team insert/delete via public.storage_property_id(name)
--
-- ROW ACCESS: photos are columns on properties/flats rows, so the existing
-- row-level policies govern exactly who sees them — no new table policies:
--   - property team: full read/write via "Property team reads/updates
--     properties" and "Property team reads/updates flats" (migration 002)
--   - marketplace viewers (incl. tenants): "Marketplace reads listed
--     properties/flats" (migration 007) exposes a row — and therefore its
--     photos — only while a PUBLISHED/FEATURED listing exists for it.

alter table public.properties
  add column if not exists photos text[] not null default '{}';

alter table public.flats
  add column if not exists photos text[] not null default '{}';

comment on column public.properties.photos is
  'Ordered storage paths in the property-images bucket. First entry is the cover photo.';

comment on column public.flats.photos is
  'Ordered storage paths in the property-images bucket. First entry is the cover photo.';
