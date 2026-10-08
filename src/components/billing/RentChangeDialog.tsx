import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { useChangeRent } from "@/hooks/useBillingData"
import { inr } from "@/lib/format"

interface Props {
  open: boolean
  onClose: () => void
  tenancyId: string
  flatId: string | null
  /** Current rent (latest history or flat rent), may be null if unknown. */
  currentRent: number | null
}

/**
 * Change rent (spec section 15). Records the change in rent_history only —
 * historical monthly records are never touched.
 */
export default function RentChangeDialog({ open, onClose, tenancyId, flatId, currentRent }: Props) {
  const { toast } = useToast()
  const changeRent = useChangeRent()

  const [newRent, setNewRent] = useState("")
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [reason, setReason] = useState("")
  const [notes, setNotes] = useState("")

  async function handleSave() {
    const n = Number(newRent)
    if (!Number.isFinite(n) || n < 0) {
      toast("error", "Enter a valid new rent.")
      return
    }
    if (!effectiveDate) {
      toast("error", "Effective date is required.")
      return
    }
    try {
      await changeRent.mutateAsync({
        tenancyId,
        flatId,
        oldRent: currentRent,
        newRent: n,
        effectiveDate,
        reason,
        notes,
      })
      toast("success", "Rent change recorded. Past monthly records are untouched.")
      onClose()
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Something went wrong.")
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Change rent"
      description={
        currentRent != null
          ? `Current rent: ${inr(currentRent)}. The change is recorded in rent history; past bills never change.`
          : "The change is recorded in rent history; past bills never change."
      }
    >
      <div className="grid gap-3">
        <div>
          <Label htmlFor="rc-new">New rent *</Label>
          <Input
            id="rc-new"
            className="mt-1"
            inputMode="decimal"
            value={newRent}
            onChange={(e) => setNewRent(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <Label htmlFor="rc-date">Effective date *</Label>
          <Input
            id="rc-date"
            type="date"
            className="mt-1"
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="rc-reason">Reason</Label>
          <Input
            id="rc-reason"
            className="mt-1"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Annual revision, market adjustment…"
          />
        </div>
        <div>
          <Label htmlFor="rc-notes">Notes</Label>
          <Textarea
            id="rc-notes"
            className="mt-1"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={changeRent.isPending}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={changeRent.isPending}>
          {changeRent.isPending ? "Saving…" : "Record rent change"}
        </Button>
      </div>
    </Dialog>
  )
}
