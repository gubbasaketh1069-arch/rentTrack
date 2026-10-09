-- ============================================================================
-- Migration 011: Fix SECURITY DEFINER functions inlined by the planner
-- ============================================================================
--
-- ROOT CAUSE of "new row violates row-level security policy" on property
-- creation (and potentially every other write guarded by these helpers):
--
-- The RLS helper functions below were declared LANGUAGE sql + SECURITY
-- DEFINER. PostgreSQL's planner may INLINE simple SQL-language functions
-- directly into the calling query. When inlined, the function call boundary
-- disappears -- and with it the SECURITY DEFINER privilege escalation.
--
-- Concretely: the SELECT policy on properties calls
-- public.has_property_access(id). When inlined, the function's inner
-- `select ... from public.properties` runs AS THE UNPRIVILEGED USER instead
-- of as postgres, hits the same RLS policy again (recursion), and evaluates
-- to FALSE. The INSERT's WITH CHECK (a plain `owner_id = auth.uid()`
-- expression, never inlined) passed fine -- which is why inserts without
-- `Prefer: return=representation` returned 201 while inserts asking
-- PostgREST to RETURN the row returned 403.
--
-- FIX: rewrite every SECURITY DEFINER RLS helper as LANGUAGE plpgsql.
-- PL/pgSQL functions are NEVER inlined, so the security-definer context is
-- always preserved. Logic is unchanged; only the language changes.
--
-- Idempotent: CREATE OR REPLACE on all eight functions.
-- ============================================================================

create or replace function public.has_property_access(p_property_id uuid)
returns boolean
language plpgsql stable security definer
set search_path = public
as $$
begin
  return exists (select 1 from public.properties p
                 where p.id = p_property_id and p.owner_id = auth.uid())
         or exists (select 1 from public.property_members pm
                    where pm.property_id = p_property_id
                      and pm.user_id = auth.uid());
end;
$$;

create or replace function public.has_property_write_access(p_property_id uuid)
returns boolean
language plpgsql stable security definer
set search_path = public
as $$
begin
  return exists (select 1 from public.properties p
                 where p.id = p_property_id and p.owner_id = auth.uid())
         or exists (select 1 from public.property_members pm
                    where pm.property_id = p_property_id
                      and pm.user_id = auth.uid()
                      and pm.role <> 'VIEWER');
end;
$$;

create or replace function public.my_tenant_id()
returns uuid
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.tenants where user_id = auth.uid() limit 1;
  return v_id;
end;
$$;

create or replace function public.can_manage_members(p_property_id uuid)
returns boolean
language plpgsql stable security definer
set search_path = public
as $$
begin
  return exists (select 1 from public.properties p
                 where p.id = p_property_id and p.owner_id = auth.uid())
         or exists (select 1 from public.property_members pm
                    where pm.property_id = p_property_id
                      and pm.user_id = auth.uid()
                      and pm.role in ('PRIMARY_OWNER', 'CO_OWNER', 'MANAGER'));
end;
$$;

create or replace function public.can_access_tenant_docs(p_tenant_id uuid)
returns boolean
language plpgsql stable security definer
set search_path = public
as $$
begin
  return p_tenant_id = public.my_tenant_id()
         or exists (select 1 from public.tenancies t
                    where t.tenant_id = p_tenant_id
                      and public.has_property_access(t.property_id));
end;
$$;

create or replace function public.can_write_tenant_docs(p_tenant_id uuid)
returns boolean
language plpgsql stable security definer
set search_path = public
as $$
begin
  return exists (select 1 from public.tenancies t
                 where t.tenant_id = p_tenant_id
                   and public.has_property_write_access(t.property_id));
end;
$$;

create or replace function public.tenant_in_property(p_property_id uuid)
returns boolean
language plpgsql stable security definer
set search_path = public
as $$
begin
  return exists (select 1 from public.tenancies t
                 where t.property_id = p_property_id
                   and t.status = 'ACTIVE'
                   and t.tenant_id = public.my_tenant_id());
end;
$$;

create or replace function public.onboarding_token_valid(p_path text)
returns boolean
language plpgsql stable security definer
set search_path = public
as $$
begin
  return exists (select 1 from public.onboarding_tokens t
                 where t.used_at is null
                   and t.expires_at > now()
                   and split_part(p_path, '/', 2) = t.token);
end;
$$;
