import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import TenantGate from "@/components/portal/TenantGate"
import { BillDetail } from "@/components/billing/BillDetail"
import { useMonthlyRecords, type MonthlyRecord } from "@/hooks/useBillingData"
import { currentYearMonth, monthLabel } from "@/lib/billing"

function BillsBody({ tenancyId }: { tenancyId: string }) {
  const records = useMonthlyRecords(tenancyId)
  const now = currentYearMonth()
  const [selected, setSelected] = useState<string | null>(null)

  const options = useMemo(() => {
    const rs = records.data ?? []
    const opts = rs.map((r) => ({ year: r.year, month: r.month, hasRecord: true }))
    if (!rs.some((r) => r.year === now.year && r.month === now.month)) {
      opts.push({ year: now.year, month: now.month, hasRecord: false })
    }
    return opts
  }, [records.data, now.year, now.month])

  useEffect(() => {
    if (selected == null && options.length > 0) {
      setSelected(`${options[0].year}-${options[0].month}`)
    }
  }, [options, selected])

  const selectedRecord: MonthlyRecord | null = useMemo(() => {
    if (!selected) return null
    const [y, m] = selected.split("-").map(Number)
    return (
      (records.data ?? []).find((r) => r.year === y && r.month === m) ?? null
    )
  }, [records.data, selected])

  if (records.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-72" />
      </div>
    )
  }

  if (records.error) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Couldn't load bills: {(records.error as Error).message}
      </p>
    )
  }

  const selLabel = selected ? monthLabel(...selected.split("-").map(Number) as [number, number]) : ""

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-bold">Rent &amp; Bills</h2>
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="tp-month" className="text-sm font-medium">
          Month
        </label>
        <select
          id="tp-month"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={selected ?? ""}
          onChange={(e) => setSelected(e.target.value)}
        >
          {options.map((o) => (
            <option key={`${o.year}-${o.month}`} value={`${o.year}-${o.month}`}>
              {monthLabel(o.year, o.month)}
              {o.hasRecord ? "" : " — no record"}
            </option>
          ))}
        </select>
      </div>

      {selectedRecord ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{selLabel}</CardTitle>
          </CardHeader>
          <CardContent>
            <BillDetail record={selectedRecord} />
            {selectedRecord.notes && (
              <p className="mt-3 text-xs text-muted-foreground">
                Note: {selectedRecord.notes}
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="mx-auto max-w-sm text-sm text-muted-foreground">
              No monthly record has been entered for this month.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/** Tenant's own monthly bills, read-only (spec section 32). */
export default function TenantBillsPage() {
  return (
    <TenantGate>
      {({ tenancy, tenancyLoading }) => {
        if (tenancyLoading) return <Skeleton className="h-48" />
        if (!tenancy) {
          return (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  No active tenancy — no bills to show.
                </p>
              </CardContent>
            </Card>
          )
        }
        return <BillsBody tenancyId={tenancy.id} />
      }}
    </TenantGate>
  )
}
