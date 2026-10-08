import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth"
import type { Tenant } from "./useTenantData"

export interface PortalDocument {
  id: string
  tenant_id: string | null
  family_member_id: string | null
  doc_type: string
  file_name: string | null
  created_at: string
  family_member_name?: string | null
}

export interface PortalNotification {
  id: string
  title: string
  body: string | null
  type: string | null
  is_read: boolean
  created_at: string
}

/**
 * The tenants row belonging to the logged-in user (tenants.user_id).
 * Null means the account exists but isn't linked to a tenancy yet —
 * the portal shows an honest "not linked" state in that case.
 */
export function useMyTenant() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["my-tenant", user?.id],
    queryFn: async (): Promise<Tenant | null> => {
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return (data as Tenant | null) ?? null
    },
    enabled: !!user,
  })
}

/** Owner-side: link a tenant's login (by signup email) to a tenants row. */
export function useLinkTenantLogin(tenantId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.rpc("link_tenant_login", {
        p_tenant_id: tenantId,
        p_email: email,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant", tenantId] })
      queryClient.invalidateQueries({ queryKey: ["tenants"] })
    },
  })
}

/** Owner-side: remove the login link from a tenants row. */
export function useUnlinkTenantLogin(tenantId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("tenants")
        .update({ user_id: null })
        .eq("id", tenantId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant", tenantId] })
      queryClient.invalidateQueries({ queryKey: ["tenants"] })
    },
  })
}

/** Tenant's own documents (theirs + family members'), newest first. */
export function useMyDocuments(tenantId: string | undefined) {
  return useQuery({
    queryKey: ["my-documents", tenantId],
    queryFn: async (): Promise<PortalDocument[]> => {
      const { data, error } = await supabase
        .from("documents")
        .select(
          "id, tenant_id, family_member_id, doc_type, file_name, created_at, family_member:family_members(full_name)"
        )
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
      if (error) throw new Error(error.message)
      interface RawDoc {
        id: string
        tenant_id: string | null
        family_member_id: string | null
        doc_type: string
        file_name: string | null
        created_at: string
        family_member: { full_name: string } | Array<{ full_name: string }> | null
      }
      const rows = (data ?? []) as unknown as RawDoc[]
      // Also pull documents attached to family members of this tenant.
      const { data: famDocs, error: famError } = await supabase
        .from("documents")
        .select(
          "id, tenant_id, family_member_id, doc_type, file_name, created_at, family_member:family_members!inner(full_name, tenant_id)"
        )
        .eq("family_member.tenant_id", tenantId!)
        .order("created_at", { ascending: false })
      if (famError) throw new Error(famError.message)
      interface RawFamDoc {
        id: string
        tenant_id: string | null
        family_member_id: string | null
        doc_type: string
        file_name: string | null
        created_at: string
        family_member: { full_name: string; tenant_id: string } | Array<{ full_name: string; tenant_id: string }> | null
      }
      const famRows = (famDocs ?? []) as unknown as RawFamDoc[]
      const first = (fm: RawDoc["family_member"] | RawFamDoc["family_member"]): string | null => {
        if (!fm) return null
        return Array.isArray(fm) ? (fm[0]?.full_name ?? null) : fm.full_name
      }
      const map = (r: RawDoc | RawFamDoc): PortalDocument => ({
        id: r.id,
        tenant_id: r.tenant_id,
        family_member_id: r.family_member_id,
        doc_type: r.doc_type,
        file_name: r.file_name,
        created_at: r.created_at,
        family_member_name: first(r.family_member),
      })
      return [...rows, ...famRows]
        .map(map)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    },
    enabled: !!tenantId,
  })
}

/** Logged-in user's notifications, newest first. */
export function useMyNotifications() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["my-notifications", user?.id],
    queryFn: async (): Promise<PortalNotification[]> => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, body, type, is_read, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
      if (error) throw new Error(error.message)
      return (data as PortalNotification[]) ?? []
    },
    enabled: !!user,
  })
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .in("id", ids)
        .eq("user_id", user!.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-notifications"] })
    },
  })
}
