-- ============================================================================
-- RentTrack migration 008 — added features A:
--   1. payments.receipt_path (auto-generated rent receipt PDFs)
--   2. notifications.channel + notifications.status (WhatsApp channel)
--   3. properties late-fee config columns
--   4. monthly_records.late_fee column
--   5. onboarding_tokens table + validate/complete RPCs (tenant self-onboarding)
--   6. storage policy for anonymous onboarding Aadhaar uploads
--
-- Run in the Supabase SQL editor AFTER 001–007.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Receipt path on payments
-- ----------------------------------------------------------------------------
alter table public.payments
  add column if not exists receipt_path text;

comment on column public.payments.receipt_path is
  'Private storage path (payment-receipts bucket) of the auto-generated receipt PDF.';

-- ----------------------------------------------------------------------------
-- 2. Notification channel + delivery status
-- ----------------------------------------------------------------------------
alter table public.notifications
  add column if not exists channel text not null default 'in_app'
  check (channel in ('in_app', 'whatsapp', 'sms', 'email'));

alter table public.notifications
  add column if not exists status text not null default 'sent'
  check (status in ('pending', 'sent', 'failed'));

comment on column public.notifications.channel is
  'Delivery channel. Rows are always written; external channels stay pending until a sender processes them.';
comment on column public.notifications.status is
  'Delivery status. in_app rows are sent immediately; whatsapp/sms rows start pending.';

-- ----------------------------------------------------------------------------
-- 3. Late-fee configuration on properties
-- ----------------------------------------------------------------------------
alter table public.properties
  add column if not exists late_fee_enabled boolean not null default false;

alter table public.properties
  add column if not exists late_fee_grace_days integer not null default 5
  check (late_fee_grace_days >= 0);

alter table public.properties
  add column if not exists late_fee_fixed numeric(12, 2) not null default 0
  check (late_fee_fixed >= 0);

alter table public.properties
  add column if not exists late_fee_per_day numeric(12, 2) not null default 0
  check (late_fee_per_day >= 0);

comment on column public.properties.late_fee_enabled is
  'When true, new monthly records auto-add a late fee if the previous month is unpaid past the grace period.';

-- ----------------------------------------------------------------------------
-- 4. Late-fee line on monthly records
-- ----------------------------------------------------------------------------
alter table public.monthly_records
  add column if not exists late_fee numeric(12, 2) not null default 0
  check (late_fee >= 0);

comment on column public.monthly_records.late_fee is
  'Auto-computed late fee for this month. Allocated under the OTHER category (last in allocation order).';

-- ----------------------------------------------------------------------------
-- 5. Self-onboarding tokens
-- ----------------------------------------------------------------------------
create table if not exists public.onboarding_tokens (
  id            uuid primary key default gen_random_uuid(),
  token         text not null unique,
  property_id   uuid not null references public.properties (id) on delete cascade,
  flat_id       uuid references public.flats (id) on delete cascade,
  expires_at    timestamptz not null,
  used_at       timestamptz,
  used_tenant_id uuid references public.tenants (id) on delete set null,
  created_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  check (expires_at > created_at)
);

comment on table public.onboarding_tokens is
  'Single-use, expiring self-onboarding links for AVAILABLE flats. Anonymous access only through the RPCs below.';

alter table public.onboarding_tokens enable row level security;

-- Property team (write access) manages tokens for their properties.
drop policy if exists "Property team manages onboarding tokens"
  on public.onboarding_tokens;
create policy "Property team manages onboarding tokens"
  on public.onboarding_tokens for all
  using (public.has_property_write_access(property_id))
  with check (public.has_property_write_access(property_id));

-- ----------------------------------------------------------------------------
-- 5b. Token validation RPC (anonymous-safe: reveals only property/flat names)
-- ----------------------------------------------------------------------------
create or replace function public.validate_onboarding_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tok public.onboarding_tokens%rowtype;
  v_prop_name text;
  v_flat_no text;
begin
  if p_token is null or p_token = '' then
    return jsonb_build_object('valid', false, 'reason', 'missing token');
  end if;

  select * into v_tok
  from public.onboarding_tokens
  where token = p_token;

  if not found then
    return jsonb_build_object('valid', false, 'reason', 'unknown token');
  end if;
  if v_tok.used_at is not null then
    return jsonb_build_object('valid', false, 'reason', 'already used');
  end if;
  if v_tok.expires_at <= now() then
    return jsonb_build_object('valid', false, 'reason', 'expired');
  end if;

  select name into v_prop_name from public.properties where id = v_tok.property_id;
  select flat_number into v_flat_no from public.flats where id = v_tok.flat_id;

  return jsonb_build_object(
    'valid', true,
    'property_id', v_tok.property_id,
    'flat_id', v_tok.flat_id,
    'property_name', v_prop_name,
    'flat_number', v_flat_no,
    'expires_at', v_tok.expires_at
  );
end;
$$;

comment on function public.validate_onboarding_token(text) is
  'Anonymous-safe token check for the public onboarding page. Reveals only property/flat names.';

-- ----------------------------------------------------------------------------
-- 5c. Complete onboarding RPC (anonymous-safe: does everything atomically)
-- ----------------------------------------------------------------------------
create or replace function public.complete_onboarding(
  p_token text,
  p_tenant jsonb,
  p_family jsonb,
  p_aadhaar_front_path text,
  p_aadhaar_back_path text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tok      public.onboarding_tokens%rowtype;
  v_tenant_id uuid;
  v_owner_id  uuid;
  v_fam       jsonb;
  v_name      text;
begin
  if p_token is null or p_token = '' then
    raise exception 'Missing token';
  end if;

  -- Lock the token row so double-submits cannot both succeed.
  select * into v_tok
  from public.onboarding_tokens
  where token = p_token
  for update;

  if not found then
    raise exception 'Unknown onboarding link';
  end if;
  if v_tok.used_at is not null then
    raise exception 'This onboarding link has already been used';
  end if;
  if v_tok.expires_at <= now() then
    raise exception 'This onboarding link has expired';
  end if;

  v_name := nullif(btrim(p_tenant ->> 'full_name'), '');
  if v_name is null then
    raise exception 'Full name is required';
  end if;

  -- 1. Tenant row (self-onboarded; no login linked yet).
  insert into public.tenants (full_name, primary_phone, address, occupation, place_of_work, notes)
  values (
    v_name,
    nullif(btrim(p_tenant ->> 'primary_phone'), ''),
    nullif(btrim(p_tenant ->> 'address'), ''),
    nullif(btrim(p_tenant ->> 'occupation'), ''),
    nullif(btrim(p_tenant ->> 'place_of_work'), ''),
    'Self-onboarded via link on ' || to_char(now(), 'DD Mon YYYY')
      || coalesce('. ' || nullif(btrim(p_tenant ->> 'notes'), ''), '')
  )
  returning id into v_tenant_id;

  -- 2. Family members.
  if p_family is not null and jsonb_typeof(p_family) = 'array' then
    for v_fam in select * from jsonb_array_elements(p_family)
    loop
      if nullif(btrim(v_fam ->> 'name'), '') is not null then
        insert into public.family_members
          (tenant_id, name, relationship, dob, age, occupation, phone, aadhaar_number, joined_date, notes)
        values (
          v_tenant_id,
          btrim(v_fam ->> 'name'),
          nullif(btrim(v_fam ->> 'relationship'), ''),
          nullif(v_fam ->> 'dob', '')::date,
          nullif(v_fam ->> 'age', '')::integer,
          nullif(btrim(v_fam ->> 'occupation'), ''),
          nullif(btrim(v_fam ->> 'phone'), ''),
          nullif(btrim(v_fam ->> 'aadhaar_number'), ''),
          current_date,
          nullif(btrim(v_fam ->> 'notes'), '')
        );
      end if;
    end loop;
  end if;

  -- 3. Aadhaar document rows (paths were uploaded by the client pre-submit).
  if p_aadhaar_front_path is not null and p_aadhaar_front_path <> '' then
    insert into public.documents (tenant_id, doc_type, storage_path, file_name)
    values (v_tenant_id, 'aadhaar_front', p_aadhaar_front_path, 'aadhaar-front');
  end if;
  if p_aadhaar_back_path is not null and p_aadhaar_back_path <> '' then
    insert into public.documents (tenant_id, doc_type, storage_path, file_name)
    values (v_tenant_id, 'aadhaar_back', p_aadhaar_back_path, 'aadhaar-back');
  end if;

  -- 4. Mark token used.
  update public.onboarding_tokens
  set used_at = now(),
      used_tenant_id = v_tenant_id
  where id = v_tok.id;

  -- 5. Notify the property owner.
  select owner_id into v_owner_id from public.properties where id = v_tok.property_id;
  if v_owner_id is not null then
    insert into public.notifications (user_id, title, body, type, related_entity, related_id, channel, status)
    values (
      v_owner_id,
      'New self-onboarded tenant',
      v_name || ' completed the onboarding form. Review their details and create a tenancy when ready.',
      'tenant_onboarded',
      'tenant',
      v_tenant_id,
      'in_app',
      'sent'
    );
  end if;

  return v_tenant_id;
end;
$$;

comment on function public.complete_onboarding(text, jsonb, jsonb, text, text) is
  'Anonymous-safe: validates the token, creates tenant + family + document rows, marks the token used, notifies the owner.';

-- ----------------------------------------------------------------------------
-- 6. Storage: anonymous onboarding uploads into aadhaar-documents/onboarding/
-- ----------------------------------------------------------------------------
-- Token portion of the path must belong to a live (unused, unexpired) token.
create or replace function public.onboarding_token_valid(p_path text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.onboarding_tokens t
    where t.used_at is null
      and t.expires_at > now()
      and split_part(p_path, '/', 2) = t.token
  );
$$;

drop policy if exists "Anonymous onboarding uploads"
  on storage.objects;
create policy "Anonymous onboarding uploads"
  on storage.objects for insert
  with check (
    bucket_id = 'aadhaar-documents'
    and name like 'onboarding/%'
    and public.onboarding_token_valid(name)
  );
