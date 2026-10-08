import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import type { Flat, Property } from "@/hooks/usePropertyData"

export type ListingStatus =
  | "DRAFT"
  | "PUBLISHED"
  | "PAUSED"
  | "FEATURED"
  | "RENTED"
  | "EXPIRED"

export type MemberRole =
  | "PRIMARY_OWNER"
  | "CO_OWNER"
  | "MANAGER"
  | "EDITOR"
  | "VIEWER"

export type InterestStatus =
  | "NEW"
  | "CONTACTED"
  | "VISIT_SCHEDULED"
  | "VISITED"
  | "INTERESTED"
  | "REJECTED"
  | "CONVERTED"

export type VisitStatus =
  | "REQUESTED"
  | "CONFIRMED"
  | "COMPLETED"
  | "CANCELLED"

export interface Listing {
  id: string
  property_id: string
  flat_id: string | null
  title: string
  description: string | null
  rent: number | null
  deposit: number | null
  maintenance: number | null
  status: ListingStatus
  available_from: string | null
  created_at: string
  updated_at: string
}

export interface ListingPhoto {
  id: string
  listing_id: string
  storage_path: string
  sort_order: number
}

export interface ListingWithJoins extends Listing {
  flat:
    | (Flat & {
        features: Array<{ feature: string }>
        floor: { name: string } | null
      })
    | null
  property: Property | null
  photos: ListingPhoto[]
}

export interface SavedListing {
  id: string
  listing_id: string
  tenant_id: string
  created_at: string
}

export interface Interest {
  id: string
  listing_id: string | null
  property_id: string | null
  flat_id: string | null
  tenant_id: string | null
  budget: number | null
  move_in_date: string | null
  message: string | null
  status: InterestStatus
  created_at: string
  updated_at: string
  tenant?: { id: string; full_name: string; primary_phone: string | null } | null
  listing?: { id: string; title: string } | null
}

export interface Visit {
  id: string
  interest_id: string | null
  listing_id: string | null
  tenant_id: string | null
  property_id: string | null
  visit_date: string | null
  status: VisitStatus
  notes: string | null
  created_at: string
  updated_at: string
  tenant?: { id: string; full_name: string; primary_phone: string | null } | null
  listing?: { id: string; title: string } | null
}

export interface Invitation {
  id: string
  property_id: string
  email: string
  role: MemberRole
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED"
  created_at: string
  property?: { id: string; name: string } | null
}

export interface PropertyMember {
  id: string
  property_id: string
  user_id: string
  role: MemberRole
  created_at: string
  profile?: { id: string; full_name: string | null; email: string | null } | null
}

const LISTING_JOINS =
  "*, flat:flats(*, features:flat_features(feature), floor:floors(name)), property:properties(*), photos:listing_photos(*)"

function invalidateMarketplace(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["listings"] })
  qc.invalidateQueries({ queryKey: ["marketplace"] })
  qc.invalidateQueries({ queryKey: ["saved-listings"] })
  qc.invalidateQueries({ queryKey: ["interests"] })
  qc.invalidateQueries({ queryKey: ["visits"] })
}

// ---------------------------------------------------------------------------
// Listings (owner)
// ---------------------------------------------------------------------------

export function useListings(propertyId?: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["listings", propertyId ?? "all", user?.id],
    queryFn: async (): Promise<ListingWithJoins[]> => {
      let req = supabase
        .from("property_listings")
        .select(LISTING_JOINS)
        .order("updated_at", { ascending: false })
      if (propertyId) req = req.eq("property_id", propertyId)
      const { data, error } = await req
      if (error) throw new Error(error.message)
      return (data ?? []) as ListingWithJoins[]
    },
    enabled: !!user,
  })
}

export interface ListingInput {
  property_id: string
  flat_id: string | null
  title: string
  description?: string | null
  rent?: number | null
  deposit?: number | null
  maintenance?: number | null
  status: ListingStatus
  available_from?: string | null
}

export function useCreateListing() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ListingInput): Promise<Listing> => {
      const { data, error } = await supabase
        .from("property_listings")
        .insert({
          property_id: input.property_id,
          flat_id: input.flat_id,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          rent: input.rent ?? null,
          deposit: input.deposit ?? null,
          maintenance: input.maintenance ?? null,
          status: input.status,
          available_from: input.available_from || null,
        })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data as Listing
    },
    onSuccess: () => invalidateMarketplace(qc),
  })
}

export function useUpdateListing() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: Partial<ListingInput> & { id: string }): Promise<Listing> => {
      const patch: Record<string, unknown> = {}
      if (input.title !== undefined) patch.title = input.title.trim()
      if (input.description !== undefined)
        patch.description = input.description?.trim() || null
      if (input.rent !== undefined) patch.rent = input.rent
      if (input.deposit !== undefined) patch.deposit = input.deposit
      if (input.maintenance !== undefined) patch.maintenance = input.maintenance
      if (input.status !== undefined) patch.status = input.status
      if (input.available_from !== undefined)
        patch.available_from = input.available_from || null
      if (input.flat_id !== undefined) patch.flat_id = input.flat_id
      const { data, error } = await supabase
        .from("property_listings")
        .update(patch)
        .eq("id", id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data as Listing
    },
    onSuccess: () => invalidateMarketplace(qc),
  })
}

export function useDeleteListing() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (listing: ListingWithJoins): Promise<void> => {
      // Remove photo files first (best-effort), then the listing row
      // (listing_photos rows cascade).
      if (listing.photos.length > 0) {
        await supabase.storage
          .from("listing-images")
          .remove(listing.photos.map((p) => p.storage_path))
      }
      const { error } = await supabase
        .from("property_listings")
        .delete()
        .eq("id", listing.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => invalidateMarketplace(qc),
  })
}

/** Flip a flat's live listings to RENTED when the flat becomes occupied. */
export async function markListingsRented(flatId: string): Promise<void> {
  const { error } = await supabase
    .from("property_listings")
    .update({ status: "RENTED" })
    .eq("flat_id", flatId)
    .in("status", ["PUBLISHED", "FEATURED"])
  if (error) throw new Error(error.message)
}

// ---------------------------------------------------------------------------
// Listing photos (public bucket)
// ---------------------------------------------------------------------------

export function listingPhotoUrl(path: string): string {
  const { data } = supabase.storage.from("listing-images").getPublicUrl(path)
  return data.publicUrl
}

export async function uploadListingPhoto(
  propertyId: string,
  file: File
): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg"
  const path = `${propertyId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from("listing-images")
    .upload(path, file, { contentType: file.type || `image/${ext}` })
  if (error) throw new Error(error.message)
  return path
}

export function useRemoveListingPhoto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (photo: ListingPhoto): Promise<void> => {
      const { error } = await supabase
        .from("listing_photos")
        .delete()
        .eq("id", photo.id)
      if (error) throw new Error(error.message)
      await supabase.storage.from("listing-images").remove([photo.storage_path])
    },
    onSuccess: () => invalidateMarketplace(qc),
  })
}

// ---------------------------------------------------------------------------
// Tenant marketplace search
// ---------------------------------------------------------------------------

/** All live listings with their flat/property — tenant search filters client-side. */
export function useMarketplaceSearch() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["marketplace", "search", user?.id],
    queryFn: async (): Promise<ListingWithJoins[]> => {
      const { data, error } = await supabase
        .from("property_listings")
        .select(LISTING_JOINS)
        .in("status", ["PUBLISHED", "FEATURED"])
        .order("updated_at", { ascending: false })
      if (error) throw new Error(error.message)
      // Only flats that are actually available (spec §47).
      return ((data ?? []) as ListingWithJoins[]).filter(
        (l) => l.flat?.status === "AVAILABLE"
      )
    },
    enabled: !!user,
  })
}

export function useMarketplaceListing(id: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["marketplace", "listing", id],
    queryFn: async (): Promise<ListingWithJoins | null> => {
      const { data, error } = await supabase
        .from("property_listings")
        .select(LISTING_JOINS)
        .eq("id", id!)
        .maybeSingle()
      if (error) throw new Error(error.message)
      const row = data as ListingWithJoins | null
      if (!row || row.flat?.status !== "AVAILABLE") return null
      return row
    },
    enabled: !!user && !!id,
  })
}

// ---------------------------------------------------------------------------
// Saved listings
// ---------------------------------------------------------------------------

export function useSavedListings() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["saved-listings", user?.id],
    queryFn: async (): Promise<ListingWithJoins[]> => {
      const { data, error } = await supabase
        .from("saved_listings")
        .select(`listing:property_listings(${LISTING_JOINS})`)
        .order("created_at", { ascending: false })
      if (error) throw new Error(error.message)
      return ((data ?? []) as unknown as Array<{ listing: ListingWithJoins | null }>)
        .map((r) => r.listing)
        .filter((l): l is ListingWithJoins => !!l)
    },
    enabled: !!user,
  })
}

export function useSaveListing() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      listingId,
      tenantId,
    }: {
      listingId: string
      tenantId: string
    }): Promise<void> => {
      const { error } = await supabase
        .from("saved_listings")
        .insert({ listing_id: listingId, tenant_id: tenantId })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => invalidateMarketplace(qc),
  })
}

export function useUnsaveListing() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      listingId,
      tenantId,
    }: {
      listingId: string
      tenantId: string
    }): Promise<void> => {
      const { error } = await supabase
        .from("saved_listings")
        .delete()
        .eq("listing_id", listingId)
        .eq("tenant_id", tenantId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => invalidateMarketplace(qc),
  })
}

// ---------------------------------------------------------------------------
// Interests
// ---------------------------------------------------------------------------

export function useInterests() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["interests", user?.id],
    queryFn: async (): Promise<Interest[]> => {
      const { data, error } = await supabase
        .from("tenant_interests")
        .select(
          "*, tenant:tenants(id, full_name, primary_phone), listing:property_listings(id, title)"
        )
        .order("created_at", { ascending: false })
        .limit(200)
      if (error) throw new Error(error.message)
      return (data ?? []) as Interest[]
    },
    enabled: !!user,
  })
}

export function useExpressInterest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      listing_id: string
      property_id: string | null
      flat_id: string | null
      tenant_id: string
      budget?: number | null
      move_in_date?: string | null
      message?: string | null
    }): Promise<void> => {
      const { error } = await supabase.from("tenant_interests").insert({
        listing_id: input.listing_id,
        property_id: input.property_id,
        flat_id: input.flat_id,
        tenant_id: input.tenant_id,
        budget: input.budget ?? null,
        move_in_date: input.move_in_date || null,
        message: input.message?.trim() || null,
        status: "NEW",
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => invalidateMarketplace(qc),
  })
}

export function useUpdateInterestStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string
      status: InterestStatus
    }): Promise<void> => {
      const { error } = await supabase
        .from("tenant_interests")
        .update({ status })
        .eq("id", id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => invalidateMarketplace(qc),
  })
}

// ---------------------------------------------------------------------------
// Visits
// ---------------------------------------------------------------------------

export function useVisits() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["visits", user?.id],
    queryFn: async (): Promise<Visit[]> => {
      const { data, error } = await supabase
        .from("property_visits")
        .select(
          "*, tenant:tenants(id, full_name, primary_phone), listing:property_listings(id, title)"
        )
        .order("visit_date", { ascending: true })
        .limit(200)
      if (error) throw new Error(error.message)
      return (data ?? []) as Visit[]
    },
    enabled: !!user,
  })
}

export function useRequestVisit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      listing_id: string
      interest_id?: string | null
      tenant_id: string
      property_id: string | null
      visit_date: string
      notes?: string | null
    }): Promise<void> => {
      const { error } = await supabase.from("property_visits").insert({
        listing_id: input.listing_id,
        interest_id: input.interest_id ?? null,
        tenant_id: input.tenant_id,
        property_id: input.property_id,
        visit_date: input.visit_date,
        notes: input.notes?.trim() || null,
        status: "REQUESTED",
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => invalidateMarketplace(qc),
  })
}

export function useUpdateVisitStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string
      status: VisitStatus
    }): Promise<void> => {
      const { error } = await supabase
        .from("property_visits")
        .update({ status })
        .eq("id", id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => invalidateMarketplace(qc),
  })
}

// ---------------------------------------------------------------------------
// Property sharing
// ---------------------------------------------------------------------------

export function usePropertyMembers(propertyId: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["property-members", propertyId],
    queryFn: async (): Promise<PropertyMember[]> => {
      const { data, error } = await supabase
        .from("property_members")
        .select("*, profile:profiles(id, full_name, email)")
        .eq("property_id", propertyId!)
        .order("created_at")
      if (error) throw new Error(error.message)
      return (data ?? []) as PropertyMember[]
    },
    enabled: !!user && !!propertyId,
  })
}

/**
 * The caller's effective role on a property: "OWNER" for the direct owner,
 * otherwise their property_members role, otherwise null (no access).
 */
export function useMyPropertyRole(propertyId: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["my-property-role", propertyId, user?.id],
    queryFn: async (): Promise<"OWNER" | MemberRole | null> => {
      const { data: prop, error: propErr } = await supabase
        .from("properties")
        .select("owner_id")
        .eq("id", propertyId!)
        .maybeSingle()
      if (propErr) throw new Error(propErr.message)
      if (!prop) return null
      if (prop.owner_id === user!.id) return "OWNER"
      const { data: mem, error: memErr } = await supabase
        .from("property_members")
        .select("role")
        .eq("property_id", propertyId!)
        .eq("user_id", user!.id)
        .maybeSingle()
      if (memErr) throw new Error(memErr.message)
      return (mem?.role as MemberRole) ?? null
    },
    enabled: !!user && !!propertyId,
  })
}

export function useRemoveMember(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (memberId: string): Promise<void> => {
      const { error } = await supabase
        .from("property_members")
        .delete()
        .eq("id", memberId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["property-members", propertyId] })
      qc.invalidateQueries({ queryKey: ["properties"] })
    },
  })
}

export function useInvitations(propertyId: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["invitations", propertyId],
    queryFn: async (): Promise<Invitation[]> => {
      const { data, error } = await supabase
        .from("property_invitations")
        .select("*")
        .eq("property_id", propertyId!)
        .order("created_at", { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []) as Invitation[]
    },
    enabled: !!user && !!propertyId,
  })
}

/** Pending invitations addressed to the signed-in user's email. */
export function useMyInvitations() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["my-invitations", user?.id],
    queryFn: async (): Promise<Invitation[]> => {
      const { data, error } = await supabase
        .from("property_invitations")
        .select("*, property:properties(id, name)")
        .eq("status", "PENDING")
        .order("created_at", { ascending: false })
      if (error) throw new Error(error.message)
      // RLS already restricts to the invitee's own email; this is belt-and-braces.
      const mine = (data ?? []) as Invitation[]
      return mine.filter(
        (i) => i.email.toLowerCase() === (user?.email ?? "").toLowerCase()
      )
    },
    enabled: !!user,
  })
}

export function useSendInvitation(propertyId: string) {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async ({
      email,
      role,
    }: {
      email: string
      role: MemberRole
    }): Promise<void> => {
      if (role === "PRIMARY_OWNER")
        throw new Error("Primary ownership can't be transferred via invitation.")
      const { error } = await supabase.from("property_invitations").insert({
        property_id: propertyId,
        email: email.trim().toLowerCase(),
        role,
        invited_by: user!.id,
        status: "PENDING",
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["invitations", propertyId] })
      void logActivity({
        action: "property_shared",
        entity: "property_invitation",
        propertyId,
        newValue: { email: vars.email, role: vars.role },
      })
    },
  })
}

export function useRevokeInvitation(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (invitationId: string): Promise<void> => {
      const { error } = await supabase
        .from("property_invitations")
        .delete()
        .eq("id", invitationId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invitations", propertyId] })
    },
  })
}

export function useAcceptInvitation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (invitationId: string): Promise<string> => {
      const { data, error } = await supabase.rpc("accept_property_invitation", {
        p_invitation_id: invitationId,
      })
      if (error) throw new Error(error.message)
      return data as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-invitations"] })
      qc.invalidateQueries({ queryKey: ["properties"] })
    },
  })
}

export function useDeclineInvitation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (invitationId: string): Promise<void> => {
      const { error } = await supabase.rpc("decline_property_invitation", {
        p_invitation_id: invitationId,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-invitations"] })
    },
  })
}
