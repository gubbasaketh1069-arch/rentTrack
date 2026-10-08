import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { Dialog } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/toast"
import { toRupees } from "@/lib/billing"
import {
  computeShares,
  sharesSumToTotal,
  SPLIT_METHOD_LABELS,
  type SplitMethod,
  type SplitPart,
} from "@/lib/meterSplit"
import {
  useCreateMeterSplit,
  type Meter,
  type MeterSplitShare,
} from "@/hooks/useMeterData"

interface SplitMeterBillDialogProps {
  open: boolean
  onClose: () => void
  meter: Meter
  propertyId: string
  flatNumber: string
}

interface Candidate extends SplitPart {
  included: boolean
}

function currentYearMonth(): { year: number; month: number } {
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

/**
 * Split a shared meter's bill across flats (added feature B).
 * The split is saved as PENDING — each share is suggested when that
 * tenancy's next monthly record is created, and marked APPLIED then.
 * Nothing touches existing (immutable) monthly records.
 */
export default function SplitMeterBillDialog({
  open,
  onClose,
  meter,
  propertyId,
  flatNumber,
}: SplitMeterBillDialogProps) {
  const { toast } = useToast()
  const createSplit = useCreateMeterSplit()

  const ym = currentYearMonth()
  const [year, setYear] = useState(String(ym.year))
  const [month, setMonth] = useState(String(ym.month))
  const [total, setTotal] = useState("")
  const [method, setMethod] = useState<SplitMethod>("equal")
  const [notes, setNotes] = useState("")
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [error, setError] = useState<string | null>(null)

  const flatsQuery = useQuery({
    queryKey: ["split-candidates", propertyId, meter.id],
    queryFn: async (): Promise<SplitPart[]> => {
      const { data, error } = await supabase
        .from("flats")
        .select(
          "id, flat_number, is_pg, tenancies!inner(id, bed_number, tenant_id, tenant:tenants(full_name))"
        )
        .eq("property_id", propertyId)
        .eq("tenancies.status", "ACTIVE")
      if (error) throw new Error(error.message)
      interface Raw {
        id: string
        flat_number: string
        is_pg: boolean
        tenancies: Array<{
          id: string
          bed_number: number | null
          tenant_id: string
          tenant: { full_name: string } | null
        }>
      }
      const parts: SplitPart[] = []
      for (const f of ((data ?? []) as unknown as Raw[])) {
        for (const t of f.tenancies ?? []) {
          parts.push({
            flatId: f.id,
            tenancyId: t.id,
            flatNumber: f.is_pg ? `${f.flat_number} · Bed ${t.bed_number ?? "?"}` : f.flat_number,
            tenantName: t.tenant?.full_name ?? "—",
            weight: 1,
          })
        }
      }
      return parts
    },
    enabled: open,
  })

  useEffect(() => {
    if (open) {
      setYear(String(ym.year))
      setMonth(String(ym.month))
      setTotal("")
      setMethod("equal")
      setNotes("")
      setError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ])

  useEffect(() => {
    if (flatsQuery.data) {
      setCandidates(flatsQuery.data.map((p) => ({ ...p, included: true })))
    }
  }, [flatsQuery.data])

  const included = useMemo(() => candidates.filter((c) => c.included), [candidates])

  const preview = useMemo(() => {
    try {
      if (!total || included.length === 0) return null
      const shares = computeShares(Number(total), method, included)
      if (!sharesSumToTotal(shares, Number(total))) return null
      return shares
    } catch {
      return null
    }
  }, [total, method, included])

  function setWeight(idx: number, value: string) {
    setCandidates((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, weight: Number(value) || 0 } : c))
    )
  }

  function toggle(idx: number) {
    setCandidates((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, included: !c.included } : c))
    )
  }

  async function handleSave() {
    setError(null)
    if (!preview) {
      setError(
        "Enter a valid bill total and a positive weight/units value for every included flat."
      )
      return
    }
    try {
      const shares: MeterSplitShare[] = preview.map((s) => ({
        flat_id: s.flatId,
        tenancy_id: s.tenancyId,
        flat_number: s.flatNumber,
        tenant_name: s.tenantName,
        share_amount: s.shareAmount,
        method,
        basis: s.basis,
      }))
      await createSplit.mutateAsync({
        meterId: meter.id,
        propertyId,
        year: Number(year),
        month: Number(month),
        totalAmount: toRupees(Number(total)),
        billKind: meter.type,
        shares,
        notes,
      })
      toast(
        "success",
        `Split saved — ₹${Number(total).toFixed(2)} across ${shares.length} tenanc${shares.length === 1 ? "y" : "ies"}. Shares apply when each tenancy's next monthly bill is created.`
      )
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the split.")
    }
  }

  const weightLabel = method === "ratio" ? "Weight" : "Units"

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Split bill — shared ${meter.type === "ELECTRICITY" ? "electricity" : "bore"} meter`}
      description={`Meter on flat ${flatNumber}. The bill is divided across flats with active tenancies; each share lands on that tenancy's next monthly record.`}
      wide
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="split-month">Billing month</Label>
            <div className="mt-1 flex gap-2">
              <select
                id="split-month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {new Date(2000, m - 1, 1).toLocaleString("en", { month: "short" })}
                  </option>
                ))}
              </select>
              <Input
                value={year}
                onChange={(e) => setYear(e.target.value)}
                inputMode="numeric"
                className="w-24"
                aria-label="Billing year"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="split-total">Total bill amount (₹) *</Label>
            <Input
              id="split-total"
              type="number"
              min="0"
              step="0.01"
              className="mt-1"
              placeholder="2400"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="split-method">Split method</Label>
            <select
              id="split-method"
              value={method}
              onChange={(e) => setMethod(e.target.value as SplitMethod)}
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {(Object.keys(SPLIT_METHOD_LABELS) as SplitMethod[]).map((m) => (
                <option key={m} value={m}>
                  {SPLIT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <Label>Flats to split across</Label>
          {flatsQuery.isLoading ? (
            <p className="mt-2 text-sm text-muted-foreground">Loading occupied flats…</p>
          ) : flatsQuery.error ? (
            <p className="mt-2 text-sm text-destructive" role="alert">
              Couldn't load flats: {(flatsQuery.error as Error).message}
            </p>
          ) : candidates.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No flats with active tenancies in this property right now.
            </p>
          ) : (
            <div className="mt-2 space-y-2">
              {candidates.map((c, i) => (
                <div key={c.tenancyId} className="flex items-center gap-3 rounded-lg border p-3">
                  <input
                    type="checkbox"
                    checked={c.included}
                    onChange={() => toggle(i)}
                    aria-label={`Include ${c.flatNumber}`}
                    className="h-4 w-4 accent-primary"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {c.flatNumber} · {c.tenantName}
                    </p>
                    {preview && c.included && (
                      <p className="text-sm font-semibold text-primary">
                        ₹
                        {preview
                          .find((s) => s.tenancyId === c.tenancyId)
                          ?.shareAmount.toFixed(2) ?? "—"}
                        <span className="ml-2 font-normal text-muted-foreground">
                          ({preview.find((s) => s.tenancyId === c.tenancyId)?.basis})
                        </span>
                      </p>
                    )}
                  </div>
                  {method !== "equal" && (
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-28"
                      placeholder={weightLabel}
                      aria-label={`${weightLabel} for ${c.flatNumber}`}
                      value={c.weight || ""}
                      onChange={(e) => setWeight(i, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <Label htmlFor="split-notes">Notes</Label>
          <Input
            id="split-notes"
            className="mt-1"
            placeholder="e.g. March BESCOM bill"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={createSplit.isPending || !preview}>
            {createSplit.isPending ? "Saving…" : "Save split"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Shares are paise-safe and always sum exactly to the total. Saved splits
          stay PENDING until each tenancy's next monthly bill is created.
        </p>
      </div>
    </Dialog>
  )
}
