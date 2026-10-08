import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth"

export interface RentalAgreement {
  id: string
  tenancy_id: string
  property_id: string | null
  flat_id: string | null
  start_date: string | null
  end_date: string | null
  document_path: string | null
  notes: string | null
  created_at: string
  updated_at: string
  tenant_name?: string | null
  flat_number?: string | null
  property_name?: string | null
}

const DOC_BUCKET = "rental-agreements"

// Storage path convention (migration 003): rental-agreements/<property_id>/<uuid>-<file>
function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80)
}

export async function uploadAgreementDocument(
  propertyId: string,
  file: File
): Promise<string> {
  const ext = file.name.includes(".")
    ? file.name.slice(file.name.lastIndexOf("."))
    : ""
  const base = sanitizeFileName(file.name.replace(ext, "") || "agreement")
  const path = `${propertyId}/${crypto.randomUUID()}-${base}${ext}`
  const { error } = await supabase.storage
    .from(DOC_BUCKET)
    .upload(path, file, { upsert: false })
  if (error) throw new Error(`Document upload failed: ${error.message}`)
  return path
}

export async function getAgreementSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(DOC_BUCKET)
    .createSignedUrl(path, 3600)
  if (error || !data?.signedUrl)
    throw new Error(`Could not open document: ${error?.message ?? "unknown error"}`)
  return data.signedUrl
}

export async function deleteAgreementFile(path: string): Promise<void> {
  const { error } = await supabase.storage.from(DOC_BUCKET).remove([path])
  if (error && !/not found/i.test(error.message))
    throw new Error(`Could not delete document file: ${error.message}`)
}

const AGREEMENT_SELECT = `
  id, tenancy_id, property_id, flat_id, start_date, end_date,
  document_path, notes, created_at, updated_at,
  tenancy:tenancies(tenant:tenants(full_name)),
  flat:flats(flat_number),
  property:properties(name)
`

interface RawAgreement {
  id: string
  tenancy_id: string
  property_id: string | null
  flat_id: string | null
  start_date: string | null
  end_date: string | null
  document_path: string | null
  notes: string | null
  created_at: string
  updated_at: string
  tenancy:
    | { tenant: { full_name: string } | Array<{ full_name: string }> | null }
    | Array<{ tenant: { full_name: string } | Array<{ full_name: string }> | null }>
    | null
  flat: { flat_number: string } | Array<{ flat_number: string }> | null
  property: { name: string } | Array<{ name: string }> | null
}

function first<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function mapAgreement(a: RawAgreement): RentalAgreement {
  const tenancy = first(a.tenancy)
  const tenant = tenancy ? first(tenancy.tenant) : null
  return {
    id: a.id,
    tenancy_id: a.tenancy_id,
    property_id: a.property_id,
    flat_id: a.flat_id,
    start_date: a.start_date,
    end_date: a.end_date,
    document_path: a.document_path,
    notes: a.notes,
    created_at: a.created_at,
    updated_at: a.updated_at,
    tenant_name: tenant?.full_name ?? null,
    flat_number: first(a.flat)?.flat_number ?? null,
    property_name: first(a.property)?.name ?? null,
  }
}

/** Days from today until end_date. Null when no end date. Negative = expired. */
export function daysUntilExpiry(endDate: string | null): number | null {
  if (!endDate) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const end = new Date(endDate + "T00:00:00")
  return Math.round((end.getTime() - today.getTime()) / 86400000)
}

/** Urgency bucket for expiry highlighting (spec section 39: 60/30/15/7 days). */
export function expiryBucket(days: number | null): "expired" | "7" | "15" | "30" | "60" | null {
  if (days === null) return null
  if (days < 0) return "expired"
  if (days <= 7) return "7"
  if (days <= 15) return "15"
  if (days <= 30) return "30"
  if (days <= 60) return "60"
  return null
}

/** Owner-side: all agreements with joins, newest end date first. */
export function useAgreements(propertyId?: string) {
  return useQuery({
    queryKey: ["agreements", propertyId ?? "all"],
    queryFn: async (): Promise<RentalAgreement[]> => {
      let q = supabase.from("rental_agreements").select(AGREEMENT_SELECT)
      if (propertyId) q = q.eq("property_id", propertyId)
      const { data, error } = await q.order("end_date", { ascending: true, nullsFirst: false })
      if (error) throw new Error(error.message)
      return ((data ?? []) as unknown as RawAgreement[]).map(mapAgreement)
    },
  })
}

/** Tenant-side: their latest agreement (via any of their tenancies). */
export function useMyAgreement(tenantId: string | undefined) {
  return useQuery({
    queryKey: ["my-agreement", tenantId],
    queryFn: async (): Promise<RentalAgreement | null> => {
      const { data: tenancies, error: tErr } = await supabase
        .from("tenancies")
        .select("id")
        .eq("tenant_id", tenantId!)
      if (tErr) throw new Error(tErr.message)
      const ids = (tenancies ?? []).map((t: { id: string }) => t.id)
      if (ids.length === 0) return null
      const { data, error } = await supabase
        .from("rental_agreements")
        .select(AGREEMENT_SELECT)
        .in("tenancy_id", ids)
        .order("end_date", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data ? mapAgreement(data as unknown as RawAgreement) : null
    },
    enabled: !!tenantId,
  })
}

export interface AgreementInput {
  tenancy_id: string
  property_id?: string | null
  flat_id?: string | null
  start_date?: string | null
  end_date?: string | null
  notes?: string | null
}

export function useCreateAgreement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: AgreementInput & { documentPath?: string | null }) => {
      const { error } = await supabase.from("rental_agreements").insert({
        tenancy_id: input.tenancy_id,
        property_id: input.property_id ?? null,
        flat_id: input.flat_id ?? null,
        start_date: input.start_date || null,
        end_date: input.end_date || null,
        document_path: input.documentPath ?? null,
        notes: input.notes || null,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agreements"] }),
  })
}

export function useUpdateAgreement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (
      input: { id: string } & Partial<AgreementInput> & { documentPath?: string | null }
    ) => {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (input.tenancy_id !== undefined) patch.tenancy_id = input.tenancy_id
      if (input.property_id !== undefined) patch.property_id = input.property_id
      if (input.flat_id !== undefined) patch.flat_id = input.flat_id
      if (input.start_date !== undefined) patch.start_date = input.start_date || null
      if (input.end_date !== undefined) patch.end_date = input.end_date || null
      if (input.notes !== undefined) patch.notes = input.notes || null
      if (input.documentPath !== undefined) patch.document_path = input.documentPath
      const { error } = await supabase
        .from("rental_agreements")
        .update(patch)
        .eq("id", input.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agreements"] }),
  })
}

export function useDeleteAgreement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (agreement: RentalAgreement) => {
      const { error } = await supabase
        .from("rental_agreements")
        .delete()
        .eq("id", agreement.id)
      if (error) throw new Error(error.message)
      if (agreement.document_path) {
        await deleteAgreementFile(agreement.document_path)
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agreements"] }),
  })
}

/**
 * Writes agreement-expiry notification rows for the signed-in owner.
 * Dedupes: one unread `agreement_expiry` row per agreement. Returns how many were created.
 * Actual push delivery is a later phase — the rows themselves are real.
 */
export function useEnsureExpiryNotifications() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (agreements: RentalAgreement[]): Promise<number> => {
      if (!user) return 0
      const expiring = agreements.filter((a) => {
        const d = daysUntilExpiry(a.end_date)
        return d !== null && d <= 60
      })
      if (expiring.length === 0) return 0
      const { data: existing, error: qErr } = await supabase
        .from("notifications")
        .select("related_id")
        .eq("user_id", user.id)
        .eq("type", "agreement_expiry")
        .eq("is_read", false)
        .in(
          "related_id",
          expiring.map((a) => a.id)
        )
      if (qErr) throw new Error(qErr.message)
      const seen = new Set((existing ?? []).map((r: { related_id: string }) => r.related_id))
      const fresh = expiring.filter((a) => !seen.has(a.id))
      if (fresh.length === 0) return 0
      const rows = fresh.map((a) => {
        const days = daysUntilExpiry(a.end_date)!
        const when =
          days < 0
            ? `expired ${-days} day${-days === 1 ? "" : "s"} ago`
            : days === 0
              ? "expires today"
              : `expires in ${days} day${days === 1 ? "" : "s"}`
        return {
          user_id: user.id,
          title: `Agreement ${when}`,
          body: `${a.tenant_name ?? "Tenant"} · ${a.property_name ?? ""} ${a.flat_number ?? ""} — agreement ${when} (${a.end_date}).`.trim(),
          type: "agreement_expiry",
          related_entity: "rental_agreement",
          related_id: a.id,
        }
      })
      const { error: iErr } = await supabase.from("notifications").insert(rows)
      if (iErr) throw new Error(iErr.message)
      return rows.length
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
      queryClient.invalidateQueries({ queryKey: ["my-notifications"] })
    },
  })
}
