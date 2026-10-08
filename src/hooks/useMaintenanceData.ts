import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth"

export const MAINTENANCE_CATEGORIES = [
  "Electricity",
  "Water",
  "Plumbing",
  "Bathroom",
  "Kitchen",
  "Fan",
  "Door",
  "Leakage",
  "Other",
] as const

export const MAINTENANCE_STATUSES = [
  "OPEN",
  "ACCEPTED",
  "IN_PROGRESS",
  "RESOLVED",
  "CANCELLED",
] as const

export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number]

export interface MaintenanceWorker {
  id: string
  property_id: string | null
  name: string
  phone: string | null
  service: string | null
  notes: string | null
  created_at: string
}

export interface RequestPhoto {
  id: string
  request_id: string
  storage_path: string
  file_name: string | null
  created_at: string
}

export interface StatusHistoryEntry {
  id: string
  request_id: string
  from_status: string | null
  to_status: string
  changed_by: string | null
  created_at: string
}

export interface MaintenanceRequest {
  id: string
  tenant_id: string | null
  property_id: string | null
  flat_id: string | null
  category: string
  description: string | null
  status: MaintenanceStatus
  worker_id: string | null
  owner_notes: string | null
  created_at: string
  updated_at: string
  tenant_name?: string | null
  flat_number?: string | null
  property_name?: string | null
  worker_name?: string | null
}

const PHOTO_BUCKET = "maintenance-images"

// Storage path convention (migration 003): maintenance-images/<property_id>/<uuid>-<file>
function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80)
}

export async function uploadMaintenancePhoto(
  propertyId: string,
  file: File
): Promise<{ path: string; fileName: string }> {
  const ext = file.name.includes(".")
    ? file.name.slice(file.name.lastIndexOf("."))
    : ""
  const base = sanitizeFileName(file.name.replace(ext, "") || "photo")
  const path = `${propertyId}/${crypto.randomUUID()}-${base}${ext}`
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, file, { upsert: false })
  if (error) throw new Error(`Photo upload failed: ${error.message}`)
  return { path, fileName: file.name }
}

export async function getMaintenancePhotoUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(path, 3600)
  if (error || !data?.signedUrl)
    throw new Error(`Could not open photo: ${error?.message ?? "unknown error"}`)
  return data.signedUrl
}

export async function deleteMaintenancePhotoFile(path: string): Promise<void> {
  const { error } = await supabase.storage.from(PHOTO_BUCKET).remove([path])
  if (error && !/not found/i.test(error.message))
    throw new Error(`Could not delete photo file: ${error.message}`)
}

const REQUEST_SELECT = `
  id, tenant_id, property_id, flat_id, category, description, status,
  worker_id, owner_notes, created_at, updated_at,
  tenant:tenants(full_name),
  flat:flats(flat_number),
  property:properties(name),
  worker:maintenance_workers(name)
`

interface RawRequest {
  id: string
  tenant_id: string | null
  property_id: string | null
  flat_id: string | null
  category: string
  description: string | null
  status: MaintenanceStatus
  worker_id: string | null
  owner_notes: string | null
  created_at: string
  updated_at: string
  tenant: { full_name: string } | Array<{ full_name: string }> | null
  flat: { flat_number: string } | Array<{ flat_number: string }> | null
  property: { name: string } | Array<{ name: string }> | null
  worker: { name: string } | Array<{ name: string }> | null
}

function first<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function mapRequest(r: RawRequest): MaintenanceRequest {
  return {
    id: r.id,
    tenant_id: r.tenant_id,
    property_id: r.property_id,
    flat_id: r.flat_id,
    category: r.category,
    description: r.description,
    status: r.status,
    worker_id: r.worker_id,
    owner_notes: r.owner_notes,
    created_at: r.created_at,
    updated_at: r.updated_at,
    tenant_name: first(r.tenant)?.full_name ?? null,
    flat_number: first(r.flat)?.flat_number ?? null,
    property_name: first(r.property)?.name ?? null,
    worker_name: first(r.worker)?.name ?? null,
  }
}

export interface MaintenanceFilters {
  propertyId?: string
  status?: string
  category?: string
}

/** Owner-side: requests across accessible properties, newest first. */
export function useMaintenanceRequests(filters: MaintenanceFilters) {
  const { propertyId, status, category } = filters
  return useQuery({
    queryKey: ["maintenance-requests", propertyId ?? null, status ?? null, category ?? null],
    queryFn: async (): Promise<MaintenanceRequest[]> => {
      let q = supabase.from("maintenance_requests").select(REQUEST_SELECT)
      if (propertyId) q = q.eq("property_id", propertyId)
      if (status) q = q.eq("status", status)
      if (category) q = q.eq("category", category)
      const { data, error } = await q.order("created_at", { ascending: false })
      if (error) throw new Error(error.message)
      return ((data ?? []) as unknown as RawRequest[]).map(mapRequest)
    },
  })
}

/** Tenant-side: the tenant's own requests. */
export function useMyMaintenanceRequests(tenantId: string | undefined) {
  return useQuery({
    queryKey: ["my-maintenance-requests", tenantId],
    queryFn: async (): Promise<MaintenanceRequest[]> => {
      const { data, error } = await supabase
        .from("maintenance_requests")
        .select(REQUEST_SELECT)
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
      if (error) throw new Error(error.message)
      return ((data ?? []) as unknown as RawRequest[]).map(mapRequest)
    },
    enabled: !!tenantId,
  })
}

export function useRequestPhotos(requestId: string | undefined) {
  return useQuery({
    queryKey: ["request-photos", requestId],
    queryFn: async (): Promise<RequestPhoto[]> => {
      const { data, error } = await supabase
        .from("maintenance_request_photos")
        .select("id, request_id, storage_path, file_name, created_at")
        .eq("request_id", requestId!)
        .order("created_at", { ascending: true })
      if (error) throw new Error(error.message)
      return (data ?? []) as RequestPhoto[]
    },
    enabled: !!requestId,
  })
}

export function useRequestHistory(requestId: string | undefined) {
  return useQuery({
    queryKey: ["request-history", requestId],
    queryFn: async (): Promise<StatusHistoryEntry[]> => {
      const { data, error } = await supabase
        .from("maintenance_status_history")
        .select("id, request_id, from_status, to_status, changed_by, created_at")
        .eq("request_id", requestId!)
        .order("created_at", { ascending: true })
      if (error) throw new Error(error.message)
      return (data ?? []) as StatusHistoryEntry[]
    },
    enabled: !!requestId,
  })
}

function invalidateMaintenance(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["maintenance-requests"] })
  qc.invalidateQueries({ queryKey: ["my-maintenance-requests"] })
  qc.invalidateQueries({ queryKey: ["request-photos"] })
  qc.invalidateQueries({ queryKey: ["request-history"] })
}

export interface NewRequestInput {
  tenant_id?: string | null
  property_id: string
  flat_id?: string | null
  category: string
  description: string
}

/** Tenant reports an issue (or owner files one). Photos are added separately after insert. */
export function useCreateMaintenanceRequest() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewRequestInput): Promise<MaintenanceRequest> => {
      const { data, error } = await supabase
        .from("maintenance_requests")
        .insert({
          tenant_id: input.tenant_id ?? null,
          property_id: input.property_id,
          flat_id: input.flat_id ?? null,
          category: input.category,
          description: input.description || null,
          status: "OPEN",
        })
        .select(REQUEST_SELECT)
        .single()
      if (error) throw new Error(error.message)
      const req = mapRequest(data as unknown as RawRequest)
      // Seed the timeline: reported → OPEN.
      const { error: histError } = await supabase
        .from("maintenance_status_history")
        .insert({
          request_id: req.id,
          from_status: null,
          to_status: "OPEN",
          changed_by: user?.id ?? null,
        })
      if (histError) throw new Error(histError.message)
      return req
    },
    onSuccess: () => invalidateMaintenance(queryClient),
  })
}

export interface UpdateRequestInput {
  id: string
  status?: MaintenanceStatus
  worker_id?: string | null
  owner_notes?: string | null
  /** Previous status, for the history row when status changes. */
  previousStatus?: MaintenanceStatus
}

/** Owner-side: status transitions, worker assignment, owner notes. Writes history on status change. */
export function useUpdateMaintenanceRequest() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateRequestInput) => {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (input.status) patch.status = input.status
      if (input.worker_id !== undefined) patch.worker_id = input.worker_id
      if (input.owner_notes !== undefined) patch.owner_notes = input.owner_notes
      const { error } = await supabase
        .from("maintenance_requests")
        .update(patch)
        .eq("id", input.id)
      if (error) throw new Error(error.message)
      if (input.status && input.previousStatus && input.status !== input.previousStatus) {
        const { error: histError } = await supabase
          .from("maintenance_status_history")
          .insert({
            request_id: input.id,
            from_status: input.previousStatus,
            to_status: input.status,
            changed_by: user?.id ?? null,
          })
        if (histError) throw new Error(histError.message)
      }
    },
    onSuccess: () => invalidateMaintenance(queryClient),
  })
}

export function useAddRequestPhotos() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      requestId: string
      propertyId: string
      files: File[]
    }): Promise<RequestPhoto[]> => {
      const out: RequestPhoto[] = []
      for (const file of input.files) {
        const { path, fileName } = await uploadMaintenancePhoto(input.propertyId, file)
        try {
          const { data, error } = await supabase
            .from("maintenance_request_photos")
            .insert({
              request_id: input.requestId,
              storage_path: path,
              file_name: fileName,
            })
            .select("id, request_id, storage_path, file_name, created_at")
            .single()
          if (error) throw error
          out.push(data as RequestPhoto)
        } catch (e) {
          // Don't orphan the file if the DB row fails.
          await deleteMaintenancePhotoFile(path).catch(() => {})
          throw new Error(
            e instanceof Error ? e.message : "Could not save photo record"
          )
        }
      }
      return out
    },
    onSuccess: () => invalidateMaintenance(queryClient),
  })
}

export function useDeleteRequestPhoto() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (photo: RequestPhoto) => {
      const { error } = await supabase
        .from("maintenance_request_photos")
        .delete()
        .eq("id", photo.id)
      if (error) throw new Error(error.message)
      await deleteMaintenancePhotoFile(photo.storage_path)
    },
    onSuccess: () => invalidateMaintenance(queryClient),
  })
}

/** Workers visible to the owner (optionally scoped to one property). */
export function useWorkers(propertyId?: string) {
  return useQuery({
    queryKey: ["maintenance-workers", propertyId ?? "all"],
    queryFn: async (): Promise<MaintenanceWorker[]> => {
      let q = supabase
        .from("maintenance_workers")
        .select("id, property_id, name, phone, service, notes, created_at")
      if (propertyId) q = q.eq("property_id", propertyId)
      const { data, error } = await q.order("name", { ascending: true })
      if (error) throw new Error(error.message)
      return (data ?? []) as MaintenanceWorker[]
    },
  })
}

export interface WorkerInput {
  property_id?: string | null
  name: string
  phone?: string | null
  service?: string | null
  notes?: string | null
}

export function useCreateWorker() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: WorkerInput) => {
      const { error } = await supabase.from("maintenance_workers").insert({
        property_id: input.property_id ?? null,
        name: input.name,
        phone: input.phone || null,
        service: input.service || null,
        notes: input.notes || null,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["maintenance-workers"] }),
  })
}

export function useUpdateWorker() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: WorkerInput & { id: string }) => {
      const { error } = await supabase
        .from("maintenance_workers")
        .update({
          property_id: input.property_id ?? null,
          name: input.name,
          phone: input.phone || null,
          service: input.service || null,
          notes: input.notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["maintenance-workers"] }),
  })
}

export function useDeleteWorker() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("maintenance_workers").delete().eq("id", id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenance-workers"] })
      invalidateMaintenance(queryClient)
    },
  })
}

export function statusBadgeVariant(status: MaintenanceStatus) {
  switch (status) {
    case "OPEN":
      return "due" as const
    case "ACCEPTED":
      return "info" as const
    case "IN_PROGRESS":
      return "partial" as const
    case "RESOLVED":
      return "paid" as const
    case "CANCELLED":
      return "neutral" as const
  }
}

export function statusLabel(status: MaintenanceStatus): string {
  switch (status) {
    case "OPEN":
      return "Open"
    case "ACCEPTED":
      return "Accepted"
    case "IN_PROGRESS":
      return "In progress"
    case "RESOLVED":
      return "Resolved"
    case "CANCELLED":
      return "Cancelled"
  }
}
