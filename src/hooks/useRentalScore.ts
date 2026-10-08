import { useMemo } from "react"
import { usePayments, useMonthlyRecords } from "./useBillingData"
import { useTenantActiveTenancy } from "./useTenantData"
import { computeRentalScore, type RentalScore, type ScoreMonth } from "@/lib/rentalScore"

/**
 * Tenant rental score from real payment history.
 * Returns null while loading; a zero-history tenant gets a score of 0/D
 * with scoredMonths: 0 (honest, not fabricated).
 */
export function useRentalScore(
  tenantId: string | undefined,
  tenancyId: string | undefined
): { data: RentalScore | null; isLoading: boolean } {
  const payments = usePayments(tenancyId)
  const records = useMonthlyRecords(tenancyId)
  const tenancy = useTenantActiveTenancy(tenantId)

  const data = useMemo<RentalScore | null>(() => {
    if (payments.isLoading || records.isLoading || tenancy.isLoading) return null
    const recs = records.data ?? []
    const pays = (payments.data ?? []).filter((p) => p.status === "SUCCESS")

    const months: ScoreMonth[] = recs.map((r) => {
      const first = pays
        .filter((p) => p.monthly_record_id === r.id)
        .sort((a, b) => a.payment_date.localeCompare(b.payment_date))[0]
      return {
        year: r.year,
        month: r.month,
        totalPayable: Number(r.total_payable),
        firstPaymentDate: first?.payment_date ?? null,
        fullyPaid: Number(r.remaining_due) <= 0.005,
        remainingDue: Number(r.remaining_due),
      }
    })

    const start = tenancy.data?.start_date
    const tenancyMonths = start
      ? Math.max(
          1,
          (new Date().getFullYear() - new Date(start).getFullYear()) * 12 +
            (new Date().getMonth() - new Date(start).getMonth()) +
            1
        )
      : 0

    return computeRentalScore(months, pays.length, tenancyMonths)
  }, [payments.data, payments.isLoading, records.data, records.isLoading, tenancy.data, tenancy.isLoading])

  return { data, isLoading: payments.isLoading || records.isLoading || tenancy.isLoading }
}
