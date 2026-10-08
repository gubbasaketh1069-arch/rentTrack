import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth"
import { isValidUpiId, canTransitionMandate, type MandateInput, type MandateStatus, type UpiMandate } from "@/lib/autopay"

/** Owner-side: all mandates for one tenant (RLS: property team). */
export function useTenantMandates(tenantId: string | undefined) {
  return useQuery({
    queryKey: ["mandates", "tenant", tenantId],
    queryFn: async (): Promise<UpiMandate[]> => {
      const { data, error } = await supabase
        .from("upi_mandates")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
      if (error) throw new Error(error.message)
      return data as UpiMandate[]
    },
    enabled: !!tenantId,
  })
}

/** Tenant-side: the logged-in tenant's own mandates (RLS: own rows only). */
export function useMyMandates(myTenantId: string | undefined) {
  return useQuery({
    queryKey: ["mandates", "mine", myTenantId],
    queryFn: async (): Promise<UpiMandate[]> => {
      const { data, error } = await supabase
        .from("upi_mandates")
        .select("*, properties(name)")
        .eq("tenant_id", myTenantId!)
        .order("created_at", { ascending: false })
      if (error) throw new Error(error.message)
      return data as UpiMandate[]
    },
    enabled: !!myTenantId,
  })
}

/**
 * Create a mandate. Always starts as PENDING_SETUP — the client can never
 * create an ACTIVE mandate; activation happens server-side via the payment
 * webhook after the provider confirms.
 */
export function useCreateMandate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: MandateInput): Promise<UpiMandate> => {
      if (!isValidUpiId(input.upiId)) {
        throw new Error("Enter a valid UPI ID (e.g. name@okhdfc).")
      }
      if (!(input.maxAmount > 0)) throw new Error("Max amount must be greater than zero.")
      const { data, error } = await supabase
        .from("upi_mandates")
        .insert({
          tenant_id: input.tenantId,
          property_id: input.propertyId,
          tenancy_id: input.tenancyId,
          provider: input.provider,
          upi_id: input.upiId.trim(),
          max_amount: input.maxAmount,
          frequency: "MONTHLY",
          status: "PENDING_SETUP",
        })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data as UpiMandate
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["mandates", "tenant", d.tenant_id] })
      qc.invalidateQueries({ queryKey: ["mandates", "mine", d.tenant_id] })
    },
  })
}

/** Pause / cancel a mandate. Activation transitions are refused client-side. */
export function useUpdateMandateStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ mandate, to }: { mandate: UpiMandate; to: MandateStatus }) => {
      if (!canTransitionMandate(mandate.status, to)) {
        throw new Error(
          `Can't move a mandate from ${mandate.status} to ${to} from here. ` +
            "Activation only happens after the payment provider confirms."
        )
      }
      const { error } = await supabase
        .from("upi_mandates")
        .update({ status: to, updated_at: new Date().toISOString() })
        .eq("id", mandate.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["mandates", "tenant", vars.mandate.tenant_id] })
      qc.invalidateQueries({ queryKey: ["mandates", "mine", vars.mandate.tenant_id] })
    },
  })
}

/** Expose the current user's role for gating owner-only mandate views. */
export function useIsOwner() {
  const { profile } = useAuth()
  return profile?.role === "OWNER"
}
