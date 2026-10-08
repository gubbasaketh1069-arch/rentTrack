import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import type { ReconcileTarget } from "@/lib/reconcile"

/**
 * Unpaid (or recently paid) monthly records across the owner's properties,
 * joined to tenant + flat for the match engine.
 */
export function useReconcileTargets(propertyId: string | undefined) {
  return useQuery({
    queryKey: ["reconcile-targets", propertyId],
    queryFn: async (): Promise<ReconcileTarget[]> => {
      const { data, error } = await supabase
        .from("monthly_records")
        .select(
          `id, tenancy_id, property_id, flat_id, year, month, total_payable, remaining_due,
           tenancy:tenancies!inner(tenant_id, tenant:tenants!inner(full_name)),
           flat:flats(flat_number)`
        )
        .eq("property_id", propertyId!)
        .order("year", { ascending: false })
        .order("month", { ascending: false })
        .limit(400)
      if (error) throw new Error(error.message)

      interface Raw {
        id: string
        tenancy_id: string
        property_id: string
        flat_id: string | null
        year: number
        month: number
        total_payable: number | string
        remaining_due: number | string
        tenancy: { tenant_id: string; tenant: { full_name: string } | null } | null
        flat: { flat_number: string } | null
      }
      return ((data ?? []) as unknown as Raw[]).map((r) => ({
        tenancyId: r.tenancy_id,
        monthlyRecordId: r.id,
        tenantId: r.tenancy?.tenant_id ?? "",
        propertyId: r.property_id,
        flatId: r.flat_id,
        tenantName: r.tenancy?.tenant?.full_name ?? "—",
        flatNumber: r.flat?.flat_number ?? null,
        year: r.year,
        month: r.month,
        remainingDue: Number(r.remaining_due),
        totalPayable: Number(r.total_payable),
      }))
    },
    enabled: !!propertyId,
  })
}

/**
 * References of already-recorded SUCCESS payments (upper-cased), used to
 * flag re-imports instead of double-recording them.
 */
export function useExistingPaymentRefs(propertyId: string | undefined) {
  return useQuery({
    queryKey: ["reconcile-refs", propertyId],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from("payments")
        .select("transaction_id")
        .eq("property_id", propertyId!)
        .eq("status", "SUCCESS")
        .not("transaction_id", "is", null)
        .limit(2000)
      if (error) throw new Error(error.message)
      const set = new Set<string>()
      for (const p of (data ?? []) as Array<{ transaction_id: string | null }>) {
        if (p.transaction_id) set.add(p.transaction_id.toUpperCase())
      }
      return set
    },
    enabled: !!propertyId,
  })
}

/** Recent payments across the owner's properties (the Payments page list). */
export function useAllPayments(propertyId: string | undefined, limit = 100) {
  return useQuery({
    queryKey: ["all-payments", propertyId, limit],
    queryFn: async () => {
      let q = supabase
        .from("payments")
        .select(
          "id, amount, method, payment_date, transaction_id, status, notes, created_at, property_id, tenant_id, tenancy_id, monthly_record_id, tenant:tenants(full_name), property:properties(name), flat:flats(flat_number)"
        )
        .order("payment_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit)
      if (propertyId && propertyId !== "all") q = q.eq("property_id", propertyId)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      return data ?? []
    },
  })
}
