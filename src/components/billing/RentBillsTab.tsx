import { useEffect, useMemo, useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  useMonthlyRecords,
  useRentHistory,
  type MonthlyRecord,
} from "@/hooks/useBillingData"
import { BillDetail } from "@/components/billing/BillDetail"
import type { Tenancy } from "@/hooks/useTenantData"
import { useFlat } from "@/hooks/usePropertyData"
import MonthlyRecordDialog from "@/components/billing/MonthlyRecordDialog"
import RecordPaymentDialog from "@/components/billing/RecordPaymentDialog"
import RentChangeDialog from "@/components/billing/RentChangeDialog"
import { currentYearMonth, monthLabel } from "@/lib/billing"
import { inr } from "@/lib/format"

interface Props {
  tenantId: string
  tenantName: string
  tenancy: Tenancy
}

/**
 * Rent & Bills tab (spec sections 16-17, 29-31): month selector, bill detail
 * table, add-record flow, record-payment flow, rent change + history.
 */
export default function RentBillsTab({ tenantId, tenantName, tenancy }: Props) {
  const records = useMonthlyRecords(tenancy.id)
  const history = useRentHistory(tenancy.id)
  const flat = useFlat(tenancy.flat_id ?? undefined)

  const now = currentYearMonth()
  const [selected, setSelected] = useState<string | null>(null)
  const [recordOpen, setRecordOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [rentOpen, setRentOpen] = useState(false)

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

  const selYearMonth = useMemo(() => {
    if (!selected) return null
    const [y, m] = selected.split("-").map(Number)
    return { year: y, month: m }
  }, [selected])

  const selectedRecord: MonthlyRecord | null = useMemo(() => {
    if (!selYearMonth) return null
    return (
      (records.data ?? []).find(
        (r) => r.year === selYearMonth.year && r.month === selYearMonth.month
      ) ?? null
    )
  }, [records.data, selYearMonth])

  const currentRent = useMemo(() => {
    const h = history.data ?? []
    if (h.length > 0) return Number(h[0].new_rent)
    const fr = flat.data?.rent
    return fr != null ? Number(fr) : null
  }, [history.data, flat.data])

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
        Couldn't load billing records: {(records.error as Error).message}
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="rb-month" className="text-sm font-medium">
            Month
          </label>
          <select
            id="rb-month"
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
        <Button size="sm" variant="outline" onClick={() => setRentOpen(true)}>
          Change rent
        </Button>
      </div>

      {selectedRecord ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">
                {monthLabel(selectedRecord.year, selectedRecord.month)}
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Previous due is carried from last month's balance — never double counted.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => setPayOpen(true)}
              disabled={Number(selectedRecord.remaining_due) <= 0}
              title={
                Number(selectedRecord.remaining_due) <= 0
                  ? "This month is fully paid"
                  : "Record a payment"
              }
            >
              PAID
            </Button>
          </CardHeader>
          <CardContent>
            <BillDetail record={selectedRecord} />
            {selectedRecord.notes && (
              <p className="mt-3 text-xs text-muted-foreground">Note: {selectedRecord.notes}</p>
            )}
          </CardContent>
        </Card>
      ) : (
        selYearMonth && (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
              <p className="max-w-sm text-sm text-muted-foreground">
                No monthly record has been entered for this month.
              </p>
              <Button onClick={() => setRecordOpen(true)}>
                <Plus className="mr-1 h-4 w-4" /> ADD MONTHLY RECORD
              </Button>
            </CardContent>
          </Card>
        )
      )}

      {/* Rent history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rent history</CardTitle>
        </CardHeader>
        <CardContent>
          {history.isLoading ? (
            <Skeleton className="h-16" />
          ) : (history.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No rent changes recorded. Current rent:{" "}
              <span className="font-medium text-foreground">
                {currentRent != null ? inr(currentRent) : "—"}
              </span>
            </p>
          ) : (
            <ul className="space-y-2.5">
              {(history.data ?? []).map((h) => (
                <li
                  key={h.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                >
                  <div>
                    <span className="font-medium">{inr(Number(h.new_rent))}</span>
                    {h.old_rent != null && (
                      <span className="ml-2 text-muted-foreground">
                        (was {inr(Number(h.old_rent))})
                      </span>
                    )}
                    <span className="ml-2 text-xs text-muted-foreground">
                      effective {h.effective_date}
                    </span>
                    {h.reason && <p className="text-xs text-muted-foreground">{h.reason}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {selYearMonth && (
        <MonthlyRecordDialog
          open={recordOpen}
          onClose={() => setRecordOpen(false)}
          tenancyId={tenancy.id}
          propertyId={tenancy.property_id}
          flatId={tenancy.flat_id}
          flatRent={currentRent ?? 0}
          year={selYearMonth.year}
          month={selYearMonth.month}
        />
      )}

      {selectedRecord && (
        <RecordPaymentDialog
          open={payOpen}
          onClose={() => setPayOpen(false)}
          record={selectedRecord}
          context={{
            tenantId,
            tenantName,
            propertyId: tenancy.property_id,
            propertyName: tenancy.property?.name ?? "—",
            flatId: tenancy.flat_id,
            flatNumber: tenancy.flat?.flat_number ?? null,
            tenancyId: tenancy.id,
          }}
        />
      )}

      <RentChangeDialog
        open={rentOpen}
        onClose={() => setRentOpen(false)}
        tenancyId={tenancy.id}
        flatId={tenancy.flat_id}
        currentRent={currentRent}
      />
    </div>
  )
}
