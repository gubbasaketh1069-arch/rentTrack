import { useEffect, useState } from "react"
import { useEndTenancy } from "@/hooks/useTenantData"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/toast"

interface EndTenancyDialogProps {
  open: boolean
  onClose: () => void
  tenancyId: string
  tenantId: string
  propertyId: string
  flatId: string | null
  flatNumber: string | null
  tenantName: string
}

const EXIT_REASONS = ["Moved out", "Eviction", "Agreement ended", "Other"]

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * End a tenancy (spec section 41, move-out): tenancy → ENDED with exit
 * date/reason, and the flat becomes AVAILABLE — or MAINTENANCE if the
 * owner chooses. History is preserved; the tenant record stays.
 */
export default function EndTenancyDialog({
  open,
  onClose,
  tenancyId,
  tenantId,
  propertyId,
  flatId,
  flatNumber,
  tenantName,
}: EndTenancyDialogProps) {
  const { toast } = useToast()
  const endTenancy = useEndTenancy()

  const [exitDate, setExitDate] = useState(todayISO())
  const [exitReason, setExitReason] = useState(EXIT_REASONS[0])
  const [exitNotes, setExitNotes] = useState("")
  const [flatAfter, setFlatAfter] = useState<"AVAILABLE" | "MAINTENANCE">("AVAILABLE")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setExitDate(todayISO())
      setExitReason(EXIT_REASONS[0])
      setExitNotes("")
      setFlatAfter("AVAILABLE")
      setError(null)
    }
  }, [open ])

  async function handleConfirm() {
    setError(null)
    if (!exitDate) {
      setError("Exit date is required.")
      return
    }
    try {
      await endTenancy.mutateAsync({
        tenancyId,
        tenantId,
        propertyId,
        flatId,
        exitDate,
        exitReason,
        exitNotes,
        flatAfter,
      })
      toast("success", `Tenancy ended for ${tenantName}.`)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.")
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`End tenancy — ${tenantName}`}
      description="The tenancy record is kept as history. Only its status changes."
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="et-date">Exit date *</Label>
            <Input
              id="et-date"
              type="date"
              className="mt-1"
              value={exitDate}
              onChange={(e) => setExitDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="et-reason">Exit reason *</Label>
            <select
              id="et-reason"
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              value={exitReason}
              onChange={(e) => setExitReason(e.target.value)}
            >
              {EXIT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <Label htmlFor="et-notes">Exit notes</Label>
          <Textarea
            id="et-notes"
            className="mt-1"
            rows={2}
            value={exitNotes}
            onChange={(e) => setExitNotes(e.target.value)}
            placeholder="Keys returned, final meter reading, deductions…"
          />
        </div>
        {flatId && (
          <div>
            <Label>Flat {flatNumber} after move-out</Label>
            <div className="mt-2 flex gap-2">
              {(["AVAILABLE", "MAINTENANCE"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFlatAfter(s)}
                  className={
                    flatAfter === s
                      ? "rounded-lg border border-primary bg-accent px-4 py-2 text-sm font-medium"
                      : "rounded-lg border px-4 py-2 text-sm hover:bg-accent"
                  }
                >
                  {s === "AVAILABLE" ? "Available" : "Maintenance"}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              The flat becomes rentable again unless it needs work first.
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={endTenancy.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={endTenancy.isPending}
          >
            {endTenancy.isPending ? "Ending…" : "End tenancy"}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
