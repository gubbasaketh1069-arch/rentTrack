import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { useCreateMonthlyRecord, useMonthlyRecords, useRentHistory } from "@/hooks/useBillingData"
import { useProperty } from "@/hooks/usePropertyData"
import { usePendingSplitsForTenancy, useSetSplitStatus, type MeterSplit } from "@/hooks/useMeterData"
import { computeLateFee, computeTotalPayable, monthLabel, toRupees, toPaise } from "@/lib/billing"
import { inr } from "@/lib/format"

interface Props {
  open: boolean
  onClose: () => void
  tenancyId: string
  propertyId: string
  flatId: string | null
  /** Flat's current rent — fallback when no rent history exists. */
  flatRent: number
  year: number
  month: number
}

function num(v: string): number {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? toRupees(toPaise(n)) : 0
}

/**
 * Add one monthly billing record (spec section 31: no record -> this dialog).
 * Applicable rent pre-fills from the latest rent history (or flat rent);
 * previous due is carried automatically from the last month's remaining.
 * Meter readings are a later phase — current/bore are manual entry.
 */
export default function MonthlyRecordDialog({
  open,
  onClose,
  tenancyId,
  propertyId,
  flatId,
  flatRent,
  year,
  month,
}: Props) {
  const { toast } = useToast()
  const createRecord = useCreateMonthlyRecord()
  const history = useRentHistory(tenancyId)
  const records = useMonthlyRecords(tenancyId)
  const property = useProperty(propertyId)
  const pendingSplits = usePendingSplitsForTenancy(open ? tenancyId : undefined)
  const setSplitStatus = useSetSplitStatus()

  const [rent, setRent] = useState("")
  const [maintenance, setMaintenance] = useState("")
  const [currentBill, setCurrentBill] = useState("")
  const [boreBill, setBoreBill] = useState("")
  const [cleaning, setCleaning] = useState("")
  const [otherCharges, setOtherCharges] = useState("")
  const [notes, setNotes] = useState("")
  /** Split ids whose shares were folded into this record (marked APPLIED on save). */
  const [appliedSplitIds, setAppliedSplitIds] = useState<string[]>([])

  const latestRent = useMemo(() => {
    const h = history.data ?? []
    return h.length > 0 ? Number(h[0].new_rent) : flatRent
  }, [history.data, flatRent])

  const carriedDue = useMemo(() => {
    const rs = records.data ?? []
    const prev = rs.find(
      (r) => r.year < year || (r.year === year && r.month < month)
    )
    return prev ? { remaining: Number(prev.remaining_due), year: prev.year, month: prev.month } : null
  }, [records.data, year, month])

  const carriedDueAmount = carriedDue?.remaining ?? 0

  /** Auto late fee from the property's config (added feature). */
  const autoLateFee = useMemo(() => {
    const p = property.data as unknown as {
      late_fee_enabled?: boolean
      late_fee_grace_days?: number
      late_fee_fixed?: number | string
      late_fee_per_day?: number | string
    } | undefined
    if (!p || !carriedDue) return 0
    return computeLateFee(
      {
        enabled: Boolean(p.late_fee_enabled),
        grace_days: Number(p.late_fee_grace_days ?? 5),
        fixed: p.late_fee_fixed ?? 0,
        per_day: p.late_fee_per_day ?? 0,
      },
      carriedDue.remaining,
      carriedDue.year,
      carriedDue.month
    )
  }, [property.data, carriedDue])

  useEffect(() => {
    if (open) {
      setRent(String(latestRent || ""))
      setMaintenance("")
      setCurrentBill("")
      setBoreBill("")
      setCleaning("")
      setOtherCharges("")
      setNotes("")
      setAppliedSplitIds([])
    }
  }, [open, latestRent])

  /** Pending meter splits targeting this tenancy — one-tap apply into the bill fields. */
  function splitShareFor(split: MeterSplit): number {
    const share = (split.shares ?? []).find((s) => s.tenancy_id === tenancyId)
    return share ? Number(share.share_amount) : 0
  }

  function applySplit(split: MeterSplit) {
    const share = splitShareFor(split)
    if (!(share > 0)) return
    if (split.bill_kind === "ELECTRICITY") {
      setCurrentBill((v) => String(toRupees(toPaise(num(v)) + toPaise(share))))
    } else {
      setBoreBill((v) => String(toRupees(toPaise(num(v)) + toPaise(share))))
    }
    setAppliedSplitIds((prev) => (prev.includes(split.id) ? prev : [...prev, split.id]))
  }

  const preview = computeTotalPayable({
    previous_due: carriedDueAmount,
    rent: num(rent),
    maintenance: num(maintenance),
    current_bill: num(currentBill),
    bore_bill: num(boreBill),
    cleaning: num(cleaning),
    other_charges: num(otherCharges),
    late_fee: autoLateFee,
  })

  async function handleSave() {
    if (!(num(rent) >= 0)) {
      toast("error", "Enter a valid rent amount.")
      return
    }
    try {
      await createRecord.mutateAsync({
        tenancyId,
        propertyId,
        flatId,
        year,
        month,
        rent: num(rent),
        maintenance: num(maintenance),
        currentBill: num(currentBill),
        boreBill: num(boreBill),
        cleaning: num(cleaning),
        otherCharges: num(otherCharges),
        lateFee: autoLateFee,
        notes,
      })
      // Shares folded in above are now billed — mark their splits APPLIED.
      const applied = (pendingSplits.data ?? []).filter((s) => appliedSplitIds.includes(s.id))
      for (const s of applied) {
        try {
          await setSplitStatus.mutateAsync({ split: s, status: "APPLIED" })
        } catch (splitErr) {
          console.warn("Split could not be marked applied:", splitErr)
        }
      }
      toast("success", `Billing record for ${monthLabel(year, month)} created.`)
      onClose()
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Something went wrong.")
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Add monthly record — ${monthLabel(year, month)}`}
      description="Previous due is carried automatically from last month's remaining balance. It is stored, never double counted."
      wide
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="mr-prevdue">Previous due (auto)</Label>
          <Input id="mr-prevdue" className="mt-1 bg-muted" value={inr(carriedDueAmount)} readOnly />
        </div>
        <div>
          <Label htmlFor="mr-latefee">Late fee (auto)</Label>
          <Input
            id="mr-latefee"
            className="mt-1 bg-muted"
            value={autoLateFee > 0 ? inr(autoLateFee) : "—"}
            readOnly
          />
          {autoLateFee > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Previous month unpaid past the grace period.
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="mr-rent">Monthly rent *</Label>
          <Input
            id="mr-rent"
            className="mt-1"
            inputMode="decimal"
            value={rent}
            onChange={(e) => setRent(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <Label htmlFor="mr-maint">Maintenance</Label>
          <Input
            id="mr-maint"
            className="mt-1"
            inputMode="decimal"
            value={maintenance}
            onChange={(e) => setMaintenance(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <Label htmlFor="mr-current">Current / electricity bill</Label>
          <Input
            id="mr-current"
            className="mt-1"
            inputMode="decimal"
            value={currentBill}
            onChange={(e) => setCurrentBill(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <Label htmlFor="mr-bore">Bore bill</Label>
          <Input
            id="mr-bore"
            className="mt-1"
            inputMode="decimal"
            value={boreBill}
            onChange={(e) => setBoreBill(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <Label htmlFor="mr-cleaning">Cleaning</Label>
          <Input
            id="mr-cleaning"
            className="mt-1"
            inputMode="decimal"
            value={cleaning}
            onChange={(e) => setCleaning(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <Label htmlFor="mr-other">Other charges</Label>
          <Input
            id="mr-other"
            className="mt-1"
            inputMode="decimal"
            value={otherCharges}
            onChange={(e) => setOtherCharges(e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="mr-notes">Notes</Label>
          <Textarea
            id="mr-notes"
            className="mt-1"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      {(pendingSplits.data ?? []).length > 0 && (
        <div className="mt-4 rounded-lg border p-4">
          <p className="text-sm font-medium">Pending meter splits</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Shared-meter shares waiting for this tenancy's next bill. Apply adds
            the share to the matching field above.
          </p>
          <div className="mt-2 space-y-2">
            {(pendingSplits.data ?? []).map((s) => {
              const share = splitShareFor(s)
              const applied = appliedSplitIds.includes(s.id)
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2 text-sm"
                >
                  <span>
                    {s.month}/{s.year} · {s.bill_kind === "ELECTRICITY" ? "Electricity" : "Bore"} share{" "}
                    <span className="font-semibold">₹{share.toFixed(2)}</span>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={applied}
                    onClick={() => applySplit(s)}
                  >
                    {applied ? "Applied ✓" : "Apply"}
                  </Button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="mt-5 flex items-center justify-between rounded-xl bg-muted px-4 py-3">
        <span className="text-sm font-medium">Total payable</span>
        <span className="text-lg font-bold">{inr(preview)}</span>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={createRecord.isPending}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={createRecord.isPending}>
          {createRecord.isPending ? "Saving…" : "Create record"}
        </Button>
      </div>
    </Dialog>
  )
}
