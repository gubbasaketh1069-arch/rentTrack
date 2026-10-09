-- ============================================================================
-- Migration 012: Direct owner SELECT policy on properties
-- ============================================================================
--
-- Migration 011 (plpgsql rewrite of RLS helpers) fixed reads/updates, but
-- INSERT...RETURNING on properties still returns 403. The has_property_access()
-- function returns FALSE specifically during INSERT...RETURNING (root cause
-- still undetermined), while the plain expression `owner_id = auth.uid()`
-- is proven to evaluate correctly (INSERT WITH CHECK passes; 201 without
-- Prefer: return=representation).
--
-- This adds a permissive SELECT policy using the proven direct expression.
-- Permissive policies OR together, so owners now pass the RETURNING check
-- via this policy even when the function-based policy returns FALSE.
-- No existing access is removed; member/tenant access is unchanged.
--
-- Idempotent.
-- ============================================================================

drop policy if exists "Owners read own properties direct" on public.properties;

create policy "Owners read own properties direct"
  on public.properties for select
  using (owner_id = auth.uid());
