import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { markListingsRented } from "@/hooks/useMarketplace"
import { useAuth } from "@/lib/auth"
import { logActivity } from "@/lib/activity"

export interface Tenant {
  id: string
  user_id: string | null
  full_name: string
  primary_phone: string | null
  address: string | null
  occupation: string | null
  place_of_work: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type TenancyStatus = "ACTIVE" | "ENDED" | "CANCELLED"

export interface Tenancy {
  id: string
  tenant_id: string
  property_id: string
  flat_id: string | null
  /** Bed number within a PG flat (1..bed_count). Null for normal flats. */
  bed_number: number | null
  start_date: string
  end_date: string | null
  status: TenancyStatus
  entry_notes: string | null
  exit_notes: string | null
  exit_reason: string | null
  created_at: string
  property?: { id: string; name: string } | null
  flat?: { id: string; flat_number: string } | null
}

export interface FamilyMember {
  id: string
  tenant_id: string
  name: string
  relationship: string | null
  dob: string | null
  age: number | null
  occupation: string | null
  phone: string | null
  aadhaar_number: string | null
  joined_date: string | null
  left_date: string | null
  notes: string | null
}

export interface PhoneNumber {
  id: string
  tenant_id: string
  phone: string
  label: string | null
  is_primary: boolean
}

export interface TenantDirectoryRow extends Tenant {
  activeTenancy: {
    id: string
    start_date: string
    property_name: string | null
    flat_number: string | null
  } | null
}

function invalidateTenant(qc: ReturnType<typeof useQueryClient>, tenantId?: string) {
  qc.invalidateQueries({ queryKey: ["tenants"] })
  if (tenantId) {
    qc.invalidateQueries({ queryKey: ["tenant", tenantId] })
    qc.invalidateQueries({ queryKey: ["tenant-tenancies", tenantId] })
    qc.invalidateQueries({ queryKey: ["tenant-active-tenancy", tenantId] })
    qc.invalidateQueries({ queryKey: ["family-members", tenantId] })
    qc.invalidateQueries({ queryKey: ["phone-numbers", tenantId] })
  }
}

function invalidateFlatContext(qc: ReturnType<typeof useQueryClient>, propertyId?: string, flatId?: string) {
  if (propertyId) {
    qc.invalidateQueries({ queryKey: ["flats", propertyId] })
    qc.invalidateQueries({ queryKey: ["active-tenancies", propertyId] })
    qc.invalidateQueries({ queryKey: ["outstanding-due", propertyId] })
  }
  if (flatId) {
    qc.invalidateQueries({ queryKey: ["flat", flatId] })
    qc.invalidateQueries({ queryKey: ["flat-tenancy", flatId] })
  }
}

/** Tenant directory: every visible tenant with their active tenancy (if any). */
export function useTenants(search: string) {
  const { user } = useAuth()
  const q = search.trim().replace(/[%_]/g, "")
  return useQuery({
    queryKey: ["tenants", "directory", user?.id, q],
    queryFn: async (): Promise<TenantDirectoryRow[]> => {
      let req = supabase
        .from("tenants")
        .select(
          "*, tenancies!left(id, start_date, status, property:properties(name), flat:flats(flat_number))"
        )
        .order("full_name")
        .limit(100)
      if (q.length > 0) {
        req = req.or(`full_name.ilike.%${q}%,primary_phone.ilike.%${q}%`)
      }
      const { data, error } = await req
      if (error) throw new Error(error.message)
      interface RawTenancy {
        id: string
        start_date: string
        status: string
        property: { name: string } | { name: string }[] | null
        flat: { flat_number: string } | { flat_number: string }[] | null
      }
      return ((data ?? []) as Array<Tenant & { tenancies: RawTenancy[] }>).map(
        (t) => {
          const active = (t.tenancies ?? []).find((x) => x.status === "ACTIVE")
          const prop = active?.property
          const flat = active?.flat
          const { tenancies: _drop, ...tenant } = t
          return {
            ...tenant,
            activeTenancy: active
              ? {
                  id: active.id,
                  start_date: active.start_date,
                  property_name: Array.isArray(prop) ? prop[0]?.name ?? null : prop?.name ?? null,
                  flat_number: Array.isArray(flat) ? flat[0]?.flat_number ?? null : flat?.flat_number ?? null,
                }
              : null,
          }
        }
      )
    },
    enabled: !!user,
  })
}

export function useTenant(id: string | undefined) {
  return useQuery({
    queryKey: ["tenant", id],
    queryFn: async (): Promise<Tenant> => {
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", id!)
        .single()
      if (error) throw new Error(error.message)
      return data as Tenant
    },
    enabled: !!id,
  })
}

/** Every tenancy of a tenant, newest first — the tenancy history. */
export function useTenantTenancies(tenantId: string | undefined) {
  return useQuery({
    queryKey: ["tenant-tenancies", tenantId],
    queryFn: async (): Promise<Tenancy[]> => {
      const { data, error } = await supabase
        .from("tenancies")
        .select("*, property:properties(id, name), flat:flats(id, flat_number)")
        .eq("tenant_id", tenantId!)
        .order("start_date", { ascending: false })
      if (error) throw new Error(error.message)
      return (data as unknown as Tenancy[]).map((t) => ({
        ...t,
        property: Array.isArray(t.property) ? t.property[0] ?? null : t.property,
        flat: Array.isArray(t.flat) ? t.flat[0] ?? null : t.flat,
      }))
    },
    enabled: !!tenantId,
  })
}

/** The tenant's current (ACTIVE) tenancy, if any. */
export function useTenantActiveTenancy(tenantId: string | undefined) {
  return useQuery({
    queryKey: ["tenant-active-tenancy", tenantId],
    queryFn: async (): Promise<Tenancy | null> => {
      const { data, error } = await supabase
        .from("tenancies")
        .select("*, property:properties(id, name), flat:flats(id, flat_number)")
        .eq("tenant_id", tenantId!)
        .eq("status", "ACTIVE")
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) return null
      const t = data as unknown as Tenancy
      return {
        ...t,
        property: Array.isArray(t.property) ? t.property[0] ?? null : t.property,
        flat: Array.isArray(t.flat) ? t.flat[0] ?? null : t.flat,
      }
    },
    enabled: !!tenantId,
  })
}

export function useFamilyMembers(tenantId: string | undefined) {
  return useQuery({
    queryKey: ["family-members", tenantId],
    queryFn: async (): Promise<FamilyMember[]> => {
      const { data, error } = await supabase
        .from("family_members")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("name")
      if (error) throw new Error(error.message)
      return data as FamilyMember[]
    },
    enabled: !!tenantId,
  })
}

export function usePhoneNumbers(tenantId: string | undefined) {
  return useQuery({
    queryKey: ["phone-numbers", tenantId],
    queryFn: async (): Promise<PhoneNumber[]> => {
      const { data, error } = await supabase
        .from("phone_numbers")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("is_primary", { ascending: false })
        .order("created_at")
      if (error) throw new Error(error.message)
      return data as PhoneNumber[]
    },
    enabled: !!tenantId,
  })
}

export type TenantInput = Pick<
  Tenant,
  "full_name" | "primary_phone" | "address" | "occupation" | "place_of_work" | "notes"
>

export function useCreateTenant() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (input: TenantInput): Promise<Tenant> => {
      const { data, error } = await supabase
        .from("tenants")
        .insert({ ...input, created_by: user!.id })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data as Tenant
    },
    onSuccess: (data) => {
      invalidateTenant(qc)
      void logActivity({
        action: "tenant_added",
        entity: "tenant",
        entityId: data.id,
        newValue: { name: data.full_name },
      })
    },
  })
}

export function useUpdateTenant(tenantId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: Partial<TenantInput>) => {
      const { error } = await supabase
        .from("tenants")
        .update(input)
        .eq("id", tenantId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => invalidateTenant(qc, tenantId),
  })
}

export interface StartTenancyInput {
  tenantId: string
  propertyId: string
  flatId: string
  startDate: string
  entryNotes?: string | null
  /** Bed number for PG flats (1..bed_count). Omitted for normal flats. */
  bedNumber?: number | null
  /** When moving a tenant who already has an active tenancy elsewhere. */
  moveFrom?: { tenancyId: string; flatId: string | null } | null
}

/**
 * Recompute a flat's occupancy status after a tenancy starts or ends.
 * Normal flats: any active tenancy → OCCUPIED. PG flats: OCCUPIED only when
 * every bed has an active tenancy, otherwise AVAILABLE (a free bed remains).
 */
async function setFlatStatusAfterOccupancyChange(flatId: string): Promise<void> {
  const { data: flatRow, error: flatReadErr } = await supabase
    .from("flats")
    .select("is_pg, bed_count")
    .eq("id", flatId)
    .single()
  if (flatReadErr) throw new Error(flatReadErr.message)
  let status: "AVAILABLE" | "OCCUPIED" = "OCCUPIED"
  if ((flatRow as { is_pg: boolean }).is_pg) {
    const { count, error: countErr } = await supabase
      .from("tenancies")
      .select("id", { count: "exact", head: true })
      .eq("flat_id", flatId)
      .eq("status", "ACTIVE")
    if (countErr) throw new Error(countErr.message)
    const beds = Number((flatRow as { bed_count: number }).bed_count) || 0
    status = beds > 0 && (count ?? 0) >= beds ? "OCCUPIED" : "AVAILABLE"
  }
  const { error: flatErr } = await supabase.from("flats").update({ status }).eq("id", flatId)
  if (flatErr) throw new Error(flatErr.message)
}

/**
 * Start a tenancy and mark the flat OCCUPIED. Optionally ends the tenant's
 * previous active tenancy first (a move). The DB's partial unique index
 * (one_active_tenancy_per_flat) is the final guard against double
 * occupancy — its violation is surfaced as a friendly message.
 */
export function useStartTenancy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: StartTenancyInput): Promise<Tenancy> => {
      if (input.moveFrom) {
        const { error: endErr } = await supabase
          .from("tenancies")
          .update({
            status: "ENDED",
            end_date: input.startDate,
            exit_reason: "Moved to another flat",
            exit_notes: "Ended automatically when the tenant moved.",
          })
          .eq("id", input.moveFrom.tenancyId)
        if (endErr) throw new Error(endErr.message)
        if (input.moveFrom.flatId) {
          await setFlatStatusAfterOccupancyChange(input.moveFrom.flatId)
        }
      }

      const { data, error } = await supabase
        .from("tenancies")
        .insert({
          tenant_id: input.tenantId,
          property_id: input.propertyId,
          flat_id: input.flatId,
          bed_number: input.bedNumber ?? null,
          start_date: input.startDate,
          status: "ACTIVE",
          entry_notes: input.entryNotes?.trim() ? input.entryNotes.trim() : null,
        })
        .select()
        .single()
      if (error) {
        if (error.code === "23505") {
          throw new Error(
            input.bedNumber
              ? `Bed ${input.bedNumber} already has an active tenant — it may have been taken just now. Please refresh and try again.`
              : "This flat already has an active tenancy — it may have been occupied just now. Please refresh and try again."
          )
        }
        throw new Error(error.message)
      }

      await setFlatStatusAfterOccupancyChange(input.flatId)

      // Spec section 45: a PUBLISHED/FEATURED listing for this flat flips to
      // RENTED automatically and leaves tenant search.
      try {
        await markListingsRented(input.flatId)
      } catch (listingErr) {
        throw new Error(
          `Tenancy created, but the listing couldn't be marked RENTED: ${
            listingErr instanceof Error ? listingErr.message : "unknown error"
          }`
        )
      }

      return data as Tenancy
    },
    onSuccess: (data, vars) => {
      invalidateTenant(qc, vars.tenantId)
      qc.invalidateQueries({ queryKey: ["listings"] })
      qc.invalidateQueries({ queryKey: ["marketplace"] })
      invalidateFlatContext(qc, vars.propertyId, vars.flatId)
      if (vars.moveFrom?.flatId) {
        qc.invalidateQueries({ queryKey: ["flat", vars.moveFrom.flatId] })
        qc.invalidateQueries({ queryKey: ["flat-tenancy", vars.moveFrom.flatId] })
      }
      void logActivity({
        action: "tenancy_started",
        entity: "tenancy",
        entityId: data.id,
        propertyId: vars.propertyId,
        newValue: { tenant_id: vars.tenantId, flat_id: vars.flatId, start_date: vars.startDate },
      })
    },
  })
}

export interface EndTenancyInput {
  tenancyId: string
  tenantId: string
  propertyId: string
  flatId: string | null
  exitDate: string
  exitReason: string
  exitNotes?: string | null
  flatAfter: "AVAILABLE" | "MAINTENANCE"
}

/** End a tenancy (move-out): tenancy → ENDED, flat → AVAILABLE/MAINTENANCE. */
export function useEndTenancy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: EndTenancyInput) => {
      const { error } = await supabase
        .from("tenancies")
        .update({
          status: "ENDED",
          end_date: input.exitDate,
          exit_reason: input.exitReason,
          exit_notes: input.exitNotes?.trim() ? input.exitNotes.trim() : null,
        })
        .eq("id", input.tenancyId)
      if (error) throw new Error(error.message)

      if (input.flatId) {
        // PG flats: other beds may still be occupied, so recompute instead of
        // blindly applying the chosen status.
        const { data: flatRow, error: flatReadErr } = await supabase
          .from("flats")
          .select("is_pg")
          .eq("id", input.flatId)
          .single()
        if (flatReadErr) throw new Error(flatReadErr.message)

        let flatStatus: "AVAILABLE" | "MAINTENANCE" = input.flatAfter
        if ((flatRow as { is_pg: boolean }).is_pg) {
          const { count, error: countErr } = await supabase
            .from("tenancies")
            .select("id", { count: "exact", head: true })
            .eq("flat_id", input.flatId)
            .eq("status", "ACTIVE")
          if (countErr) throw new Error(countErr.message)
          if ((count ?? 0) > 0) {
            if (input.flatAfter === "MAINTENANCE") {
              throw new Error(
                `Can't mark this flat as maintenance — ${count} other bed${count === 1 ? " is" : "s are"} still occupied. End those tenancies first.`
              )
            }
            flatStatus = "AVAILABLE" // a bed just freed up
          }
        }

        const { error: flatError } = await supabase
          .from("flats")
          .update({ status: flatStatus })
          .eq("id", input.flatId)
        if (flatError) throw new Error(flatError.message)
      }
    },
    onSuccess: (_d, vars) => {
      invalidateTenant(qc, vars.tenantId)
      qc.invalidateQueries({ queryKey: ["listings"] })
      qc.invalidateQueries({ queryKey: ["marketplace"] })
      invalidateFlatContext(qc, vars.propertyId, vars.flatId ?? undefined)
      void logActivity({
        action: "tenancy_ended",
        entity: "tenancy",
        entityId: vars.tenancyId,
        propertyId: vars.propertyId,
        newValue: { exit_date: vars.exitDate, exit_reason: vars.exitReason },
      })
    },
  })
}

export type FamilyMemberInput = Pick<
  FamilyMember,
  | "name"
  | "relationship"
  | "dob"
  | "age"
  | "occupation"
  | "phone"
  | "aadhaar_number"
  | "joined_date"
  | "left_date"
  | "notes"
>

export function useCreateFamilyMember(tenantId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: FamilyMemberInput) => {
      const { error } = await supabase
        .from("family_members")
        .insert({ ...input, tenant_id: tenantId })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => invalidateTenant(qc, tenantId),
  })
}

export function useUpdateFamilyMember(tenantId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: FamilyMemberInput & { id: string }) => {
      const { id, ...rest } = input
      const { error } = await supabase
        .from("family_members")
        .update(rest)
        .eq("id", id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => invalidateTenant(qc, tenantId),
  })
}

export function useDeleteFamilyMember(tenantId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("family_members").delete().eq("id", id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => invalidateTenant(qc, tenantId),
  })
}

export function useAddPhoneNumber(tenantId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { phone: string; label?: string | null }) => {
      const { error } = await supabase.from("phone_numbers").insert({
        tenant_id: tenantId,
        phone: input.phone.trim(),
        label: input.label?.trim() ? input.label.trim() : null,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => invalidateTenant(qc, tenantId),
  })
}

export function useDeletePhoneNumber(tenantId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("phone_numbers").delete().eq("id", id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => invalidateTenant(qc, tenantId),
  })
}

/** Mark a number primary — also syncs tenants.primary_phone. */
export function useSetPrimaryPhone(tenantId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { phoneId: string; phone: string }) => {
      const { error: clearErr } = await supabase
        .from("phone_numbers")
        .update({ is_primary: false })
        .eq("tenant_id", tenantId)
      if (clearErr) throw new Error(clearErr.message)
      const { error: setErr } = await supabase
        .from("phone_numbers")
        .update({ is_primary: true })
        .eq("id", input.phoneId)
      if (setErr) throw new Error(setErr.message)
      const { error: tenantErr } = await supabase
        .from("tenants")
        .update({ primary_phone: input.phone })
        .eq("id", tenantId)
      if (tenantErr) throw new Error(tenantErr.message)
    },
    onSuccess: () => invalidateTenant(qc, tenantId),
  })
}
