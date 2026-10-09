import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { deletePhotoObjects } from "@/lib/propertyPhotos"
import { FLOOR_STRUCTURE_OPTIONS } from "@/lib/constants"

export interface Property {
  id: string
  owner_id: string
  name: string
  property_type: string | null
  address: string | null
  area: string | null
  locality: string | null
  landmark: string | null
  city: string | null
  state: string | null
  pincode: string | null
  description: string | null
  floor_structure: string | null
  notes: string | null
  effective_date: string | null
  /** Late-fee config (added feature). */
  late_fee_enabled: boolean | null
  late_fee_grace_days: number | null
  late_fee_fixed: number | string | null
  late_fee_per_day: number | string | null
  /** Ordered photo storage paths in the property-images bucket (first = cover). */
  photos: string[]
  created_at: string
  updated_at: string
}

export interface Floor {
  id: string
  property_id: string
  name: string
  sort_order: number
}

export interface Flat {
  id: string
  property_id: string
  floor_id: string | null
  flat_number: string
  bhk_type: string | null
  room_type: string | null
  rent: number
  deposit: number
  maintenance: number
  status: "AVAILABLE" | "OCCUPIED" | "NOTICE_PERIOD" | "MAINTENANCE" | "OWNER_USE"
  notes: string | null
  /** PG / co-living mode: the flat rents by bed. */
  is_pg: boolean
  /** Number of beds when is_pg is true. */
  bed_count: number
  /** Ordered photo storage paths in the property-images bucket (first = cover). */
  photos: string[]
}

export interface ActiveTenancy {
  id: string
  flat_id: string | null
  tenant_id: string
  tenant: { full_name: string } | null
}

/** Properties the user owns directly. */
export function useMyProperties() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["properties", "mine", user?.id],
    queryFn: async (): Promise<Property[]> => {
      const { data, error } = await supabase
        .from("properties")
        .select("*")
        .eq("owner_id", user!.id)
        .order("created_at", { ascending: false })
      if (error) throw new Error(error.message)
      return data as Property[]
    },
    enabled: !!user,
  })
}

/** Properties shared with the user by other owners (via property_members). */
export function useSharedProperties() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["properties", "shared", user?.id],
    queryFn: async (): Promise<Array<Property & { member_role: string }>> => {
      const { data, error } = await supabase
        .from("property_members")
        .select("role, property:properties(*)")
        .eq("user_id", user!.id)
      if (error) throw new Error(error.message)
      interface MemberRow {
        role: string
        property: Property | Property[] | null
      }
      return ((data ?? []) as MemberRow[])
        .map((m) => {
          const prop = Array.isArray(m.property) ? m.property[0] : m.property
          if (!prop) return null
          return { ...prop, member_role: m.role }
        })
        .filter(
          (p): p is Property & { member_role: string } =>
            !!p && p.owner_id !== user!.id
        )
    },
    enabled: !!user,
  })
}

export function useProperty(id: string | undefined) {
  return useQuery({
    queryKey: ["property", id],
    queryFn: async (): Promise<Property> => {
      const { data, error } = await supabase
        .from("properties")
        .select("*")
        .eq("id", id!)
        .single()
      if (error) throw new Error(error.message)
      return data as Property
    },
    enabled: !!id,
  })
}

export function useFloors(propertyId: string | undefined) {
  return useQuery({
    queryKey: ["floors", propertyId],
    queryFn: async (): Promise<Floor[]> => {
      const { data, error } = await supabase
        .from("floors")
        .select("*")
        .eq("property_id", propertyId!)
        .order("sort_order")
        .order("name")
      if (error) throw new Error(error.message)
      return data as Floor[]
    },
    enabled: !!propertyId,
  })
}

export function useFlats(propertyId: string | undefined) {
  return useQuery({
    queryKey: ["flats", propertyId],
    queryFn: async (): Promise<Flat[]> => {
      const { data, error } = await supabase
        .from("flats")
        .select("*")
        .eq("property_id", propertyId!)
        .order("flat_number")
      if (error) throw new Error(error.message)
      return (data as Flat[]).map((f) => ({
        ...f,
        rent: Number(f.rent),
        deposit: Number(f.deposit),
        maintenance: Number(f.maintenance),
      }))
    },
    enabled: !!propertyId,
  })
}

export function useFlat(flatId: string | undefined) {
  return useQuery({
    queryKey: ["flat", flatId],
    queryFn: async (): Promise<Flat> => {
      const { data, error } = await supabase
        .from("flats")
        .select("*")
        .eq("id", flatId!)
        .single()
      if (error) throw new Error(error.message)
      const f = data as Flat
      return {
        ...f,
        rent: Number(f.rent),
        deposit: Number(f.deposit),
        maintenance: Number(f.maintenance),
      }
    },
    enabled: !!flatId,
  })
}

export function useFlatFeatures(flatId: string | undefined) {
  return useQuery({
    queryKey: ["flat-features", flatId],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("flat_features")
        .select("feature")
        .eq("flat_id", flatId!)
      if (error) throw new Error(error.message)
      return (data as Array<{ feature: string }>).map((r) => r.feature)
    },
    enabled: !!flatId,
  })
}

/** Active tenancies of a property, with tenant names — for flat cards. */
export function useActiveTenancies(propertyId: string | undefined) {
  return useQuery({
    queryKey: ["active-tenancies", propertyId],
    queryFn: async (): Promise<ActiveTenancy[]> => {
      const { data, error } = await supabase
        .from("tenancies")
        .select("id, flat_id, tenant_id, tenant:tenants(full_name)")
        .eq("property_id", propertyId!)
        .eq("status", "ACTIVE")
      if (error) throw new Error(error.message)
      return data as unknown as ActiveTenancy[]
    },
    enabled: !!propertyId,
  })
}

/** Outstanding due = sum of remaining_due on monthly records of active tenancies. */
export function useOutstandingDue(propertyId: string | undefined) {
  return useQuery({
    queryKey: ["outstanding-due", propertyId],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from("monthly_records")
        .select("remaining_due, tenancy:tenancies!inner(property_id, status)")
        .eq("tenancy.property_id", propertyId!)
        .eq("tenancy.status", "ACTIVE")
        .gt("remaining_due", 0)
      if (error) throw new Error(error.message)
      return (data as Array<{ remaining_due: number | string }>).reduce(
        (sum, r) => sum + Number(r.remaining_due),
        0
      )
    },
    enabled: !!propertyId,
  })
}

function invalidateProperty(qc: ReturnType<typeof useQueryClient>, propertyId?: string) {
  qc.invalidateQueries({ queryKey: ["properties"] })
  if (propertyId) {
    qc.invalidateQueries({ queryKey: ["property", propertyId] })
    qc.invalidateQueries({ queryKey: ["floors", propertyId] })
    qc.invalidateQueries({ queryKey: ["flats", propertyId] })
    qc.invalidateQueries({ queryKey: ["active-tenancies", propertyId] })
    qc.invalidateQueries({ queryKey: ["outstanding-due", propertyId] })
  }
}

export type PropertyInput = Omit<
  Property,
  "id" | "owner_id" | "created_at" | "updated_at"
>

export function useCreateProperty() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (input: PropertyInput): Promise<Property> => {
      // The on_property_created trigger adds the PRIMARY_OWNER membership row.
      // NOTE: Insert without RETURNING (.select()) -- the RLS USING check on
      // INSERT...RETURNING wrongly rejects the new row, while plain INSERT
      // (WITH CHECK only) succeeds. Generate the id client-side, insert,
      // then fetch the row with a separate SELECT (which passes RLS).
      const newId = crypto.randomUUID()
      const { error } = await supabase
        .from("properties")
        .insert({ ...input, id: newId, owner_id: user!.id })
      if (error) throw new Error(error.message)
      // Auto-create floor records from the chosen structure, so flats can
      // be assigned to a real floor immediately (no more "Unassigned").
      const structure = FLOOR_STRUCTURE_OPTIONS.find(
        (o) => o.value === input.floor_structure
      )
      if (structure && structure.floors.length > 0) {
        const { error: floorError } = await supabase.from("floors").insert(
          structure.floors.map((name, i) => ({
            id: crypto.randomUUID(),
            property_id: newId,
            name,
            sort_order: i,
          }))
        )
        // Floors are a convenience -- don't fail property creation if this fails.
        if (floorError) console.warn("Auto-create floors failed:", floorError.message)
      }
      const { data, error: fetchError } = await supabase
        .from("properties")
        .select("*")
        .eq("id", newId)
        .single()
      if (fetchError) throw new Error(fetchError.message)
      return data as Property
    },
    onSuccess: (data) => {
      invalidateProperty(qc)
      void logActivity({
        action: "property_created",
        entity: "property",
        entityId: data.id,
        propertyId: data.id,
        newValue: { name: data.name },
      })
    },
  })
}

export function useUpdateProperty(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: Partial<PropertyInput>) => {
      const { error } = await supabase
        .from("properties")
        .update(input)
        .eq("id", propertyId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => invalidateProperty(qc, propertyId),
  })
}

export function useDeleteProperty() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (propertyId: string) => {
      // Collect photo paths BEFORE the cascade delete (flats cascade), and
      // remove the storage objects first — a failure aborts before anything
      // is deleted, so no orphaned files remain.
      const [{ data: prop }, { data: flatRows }] = await Promise.all([
        supabase.from("properties").select("photos").eq("id", propertyId).single(),
        supabase.from("flats").select("photos").eq("property_id", propertyId),
      ])
      const paths: string[] = [
        ...(((prop?.photos as string[] | null) ?? []) as string[]),
        ...((flatRows ?? []).flatMap(
          (f) => ((f.photos as string[] | null) ?? []) as string[]
        )),
      ]
      await deletePhotoObjects(paths)
      const { error } = await supabase
        .from("properties")
        .delete()
        .eq("id", propertyId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => invalidateProperty(qc),
  })
}

export function useCreateFloor(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string; sort_order: number }) => {
      const { error } = await supabase
        .from("floors")
        .insert({ property_id: propertyId, ...input })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => invalidateProperty(qc, propertyId),
  })
}

export function useUpdateFloor(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; name: string }) => {
      const { error } = await supabase
        .from("floors")
        .update({ name: input.name })
        .eq("id", input.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => invalidateProperty(qc, propertyId),
  })
}

export function useDeleteFloor(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (floorId: string) => {
      const { error } = await supabase.from("floors").delete().eq("id", floorId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => invalidateProperty(qc, propertyId),
  })
}

export type FlatInput = Omit<Flat, "id" | "property_id"> & {
  features: string[]
}

export function useCreateFlat(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: FlatInput): Promise<Flat> => {
      const { features, ...flat } = input
      // NOTE: Insert without RETURNING -- see useCreateProperty for why.
      // Generate the id client-side so flat_features can reference it.
      const newId = crypto.randomUUID()
      const { error } = await supabase
        .from("flats")
        .insert({ ...flat, id: newId, property_id: propertyId })
      if (error) throw new Error(error.message)
      if (features.length > 0) {
        const { error: featError } = await supabase
          .from("flat_features")
          .insert(features.map((feature) => ({ flat_id: newId, feature })))
        if (featError) throw new Error(featError.message)
      }
      const { data, error: fetchError } = await supabase
        .from("flats")
        .select("*")
        .eq("id", newId)
        .single()
      if (fetchError) throw new Error(fetchError.message)
      return data as Flat
    },
    onSuccess: () => invalidateProperty(qc, propertyId),
  })
}

export function useUpdateFlat(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: FlatInput & { id: string }) => {
      const { features, id, ...flat } = input
      const { error } = await supabase.from("flats").update(flat).eq("id", id)
      if (error) throw new Error(error.message)
      // Replace the feature set wholesale — features are a flat attribute,
      // not historical data.
      const { error: delError } = await supabase
        .from("flat_features")
        .delete()
        .eq("flat_id", id)
      if (delError) throw new Error(delError.message)
      if (features.length > 0) {
        const { error: featError } = await supabase
          .from("flat_features")
          .insert(features.map((feature) => ({ flat_id: id, feature })))
        if (featError) throw new Error(featError.message)
      }
    },
    onSuccess: (_d, vars) => {
      invalidateProperty(qc, propertyId)
      qc.invalidateQueries({ queryKey: ["flat", vars.id] })
      qc.invalidateQueries({ queryKey: ["flat-features", vars.id] })
    },
  })
}

export function useDeleteFlat(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (flatId: string) => {
      // Remove the flat's photo objects before deleting the row — a storage
      // failure aborts before anything is deleted, so no orphans remain.
      const { data } = await supabase
        .from("flats")
        .select("photos")
        .eq("id", flatId)
        .single()
      await deletePhotoObjects(((data?.photos as string[] | null) ?? []) as string[])
      const { error } = await supabase.from("flats").delete().eq("id", flatId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => invalidateProperty(qc, propertyId),
  })
}
