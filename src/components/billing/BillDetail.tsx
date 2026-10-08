import { useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useMonthlyRecordPayments, type MonthlyRecord } from "@/hooks/useBillingData"
import { ALLOCATION_ORDER, toPaise, toRupees } from "@/lib/billing"
import { inr } from "@/lib/format"
import { cn } from "@/lib/utils"

export const BILL_BADGE: Record<
  MonthlyRecord["status"],
  "paid" | "partial" | "due" | "neutral"
> = {
  PAID: "paid",
  PARTIAL: "partial",
  LATE_DUE: "partial",
  DUE: "due",
}

/** Bucket key on the record -> allocation category, in display order.
 *  Late fee is billed as its own line but settles through the OTHER
 *  allocation bucket (last in allocation order). */
export const BILL_ROWS: Array<{
  label: string
  bucket: keyof MonthlyRecord | null
  category: (typeof ALLOCATION_ORDER)[number] | null
  /** When true, paid/remaining are shown as part of the mapped category's row. */
  displayOnly?: boolean
}> = [
  { label: "Previous Due", bucket: "previous_due", category: "PREVIOUS_DUE" },
  { label: "Monthly Rent", bucket: "applicable_rent", category: "CURRENT_RENT" },
  { label: "Maintenance", bucket: "maintenance", category: "MAINTENANCE" },
  { label: "Current Bill", bucket: "current_bill", category: "CURRENT_BILL" },
  { label: "Bore Bill", bucket: "bore_bill", category: "BORE" },
  { label: "Cleaning", bucket: "cleaning", category: "CLEANING" },
  { label: "Late Fee", bucket: "late_fee", category: "OTHER", displayOnly: true },
  { label: "Other Charges", bucket: "other_charges", category: "OTHER" },
]

/**
 * Monthly bill detail table (spec section 29): Particular / Amount / Paid /
 * Remaining per charge bucket, plus totals. Purely presentational — used by
 * both the owner console and the read-only tenant portal.
 */
export function BillDetail({ record }: { record: MonthlyRecord }) {
  const payments = useMonthlyRecordPayments(record.id)

  const paidByCategory = useMemo(() => {
    const sums: Partial<Record<(typeof ALLOCATION_ORDER)[number], number>> = {}
    for (const p of payments.data ?? []) {
      if (p.status !== "SUCCESS") continue
      for (const a of p.allocations ?? []) {
        sums[a.category] = toRupees(toPaise(sums[a.category] ?? 0) + toPaise(a.amount))
      }
    }
    return sums
  }, [payments.data])

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-4 font-medium">Particular</th>
            <th className="py-2 pr-4 text-right font-medium">Amount</th>
            <th className="py-2 pr-4 text-right font-medium">Paid</th>
            <th className="py-2 text-right font-medium">Remaining</th>
          </tr>
        </thead>
        <tbody>
          {BILL_ROWS.map((row) => {
            const amount = Number(record[row.bucket as keyof MonthlyRecord] ?? 0)
            if (amount === 0 && row.displayOnly) return null
            const paid = row.category && !row.displayOnly ? (paidByCategory[row.category] ?? 0) : 0
            const remaining = toRupees(Math.max(0, toPaise(amount) - toPaise(paid)))
            return (
              <tr key={row.label} className="border-b last:border-0">
                <td className="py-2.5 pr-4">
                  {row.label}
                  {row.displayOnly && (
                    <span className="ml-1 text-xs text-muted-foreground">(settled via Other Charges)</span>
                  )}
                </td>
                <td className="py-2.5 pr-4 text-right">{inr(amount)}</td>
                <td className="py-2.5 pr-4 text-right text-muted-foreground">
                  {row.displayOnly ? "—" : inr(paid)}
                </td>
                <td className={cn("py-2.5 text-right font-medium", remaining > 0 && "text-status-due")}>
                  {row.displayOnly ? "—" : inr(remaining)}
                </td>
              </tr>
            )
          })}
          <tr className="border-t-2 font-semibold">
            <td className="py-2.5 pr-4">Total Payable</td>
            <td className="py-2.5 pr-4 text-right" colSpan={3}>{inr(Number(record.total_payable))}</td>
          </tr>
          <tr>
            <td className="py-2.5 pr-4">Total Paid</td>
            <td className="py-2.5 pr-4 text-right" colSpan={3}>{inr(Number(record.total_paid))}</td>
          </tr>
          <tr className="font-semibold">
            <td className="py-2.5 pr-4">Remaining Due</td>
            <td className="py-2.5 pr-4 text-right" colSpan={2}>
              {inr(Number(record.remaining_due))}
            </td>
            <td className="py-2.5 text-right">
              <Badge variant={BILL_BADGE[record.status]}>{record.status.replace("_", " ")}</Badge>
            </td>
          </tr>
        </tbody>
      </table>
      {payments.isLoading && <Skeleton className="mt-2 h-6 w-1/2" />}
    </div>
  )
}
