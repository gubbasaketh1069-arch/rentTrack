-- ============================================================================
-- Migration 013: Add OWNER_USE flat status
-- ============================================================================
-- New flat status for flats used by the owner themselves (not rented out).
-- These flats don't appear as available for rent.
-- Idempotent.
-- ============================================================================

alter table public.flats drop constraint if exists flats_status_check;

alter table public.flats
  add constraint flats_status_check
  check (status in ('AVAILABLE', 'OCCUPIED', 'NOTICE_PERIOD', 'MAINTENANCE', 'OWNER_USE'));
