import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { useSaveAdvance, type AdvanceDeposit } from "@/hooks/useBillingData"

interface Props {
  open: boolean
  onClose: () => void
  tenancyId: string
  existing: AdvanceDeposit | null
}

/**
 * Advance / security deposit (spec section 23). Records receipt, refund and
 * adjustments. Advance is kept completely separate from monthly rent — it is
 * never added to any bill.
 */
export default function AdvanceDialog({ open, onClose, tenancyId, existing }: Props) {
  const { toast } = useToast()
  const saveAdvance = useSaveAdvance()

  const [agreed, setAgreed] = useState("")
  const [received, setReceived] = useState("")
  const [receivedDate, setReceivedDate] = useState("")
  const [method, setMethod] = useState("")
  const [refunded, setRefunded] = useState("")
  const [refundDate, setRefundDate] = useState("")
  const [adjusted, setAdjusted] = useState("")
  const [notes, setNotes] = useState("")

  useEffect(() => {
    if (open) {
      setAgreed(existing ? String(Number(existing.agreed_amount)) : "")
      setReceived(existing ? String(Number(existing.amount_received)) : "")
      setReceivedDate(existing?.received_date ?? "")
      setMethod(existing?.method ?? "")
      setRefunded(existing ? String(Number(existing.refunded_amount)) : "")
      setRefundDate(existing?.refund_date ?? "")
      setAdjusted(existing ? String(Number(existing.adjusted_amount)) : "")
      setNotes(existing?.notes ?? "")
    }
  }, [open, existing])

  const n = (v: string) => {
    const x = Number(v)
    return Number.isFinite(x) && x >= 0 ? x : 0
  }

  async function handleSave() {
    try {
      const status = await saveAdvance.mutateAsync({
        tenancyId,
        id: existing?.id,
        agreedAmount: n(agreed),
        amountReceived: n(received),
        receivedDate: receivedDate || null,
        method: method || null,
        refundedAmount: n(refunded),
        refundDate: refundDate || null,
        adjustedAmount: n(adjusted),
        notes,
      })
      toast("success", `Advance saved (status: ${status}).`)
      onClose()
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Something went wrong.")
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={existing ? "Update advance / deposit" : "Record advance / deposit"}
      description="Security deposits are tracked separately and never added to monthly rent payable."
      wide
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="ad-agreed">Agreed amount</Label>
          <Input id="ad-agreed" className="mt-1" inputMode="decimal" value={agreed} onChange={(e) => setAgreed(e.target.value)} placeholder="0" />
        </div>
        <div>
          <Label htmlFor="ad-received">Amount received</Label>
          <Input id="ad-received" className="mt-1" inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value)} placeholder="0" />
        </div>
        <div>
          <Label htmlFor="ad-rdate">Received date</Label>
          <Input id="ad-rdate" type="date" className="mt-1" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="ad-method">Payment method</Label>
          <Input id="ad-method" className="mt-1" value={method} onChange={(e) => setMethod(e.target.value)} placeholder="UPI, cash…" />
        </div>
        <div>
          <Label htmlFor="ad-refunded">Refunded amount</Label>
          <Input id="ad-refunded" className="mt-1" inputMode="decimal" value={refunded} onChange={(e) => setRefunded(e.target.value)} placeholder="0" />
        </div>
        <div>
          <Label htmlFor="ad-rfdate">Refund date</Label>
          <Input id="ad-rfdate" type="date" className="mt-1" value={refundDate} onChange={(e) => setRefundDate(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="ad-adjusted">Adjusted amount</Label>
          <Input id="ad-adjusted" className="mt-1" inputMode="decimal" value={adjusted} onChange={(e) => setAdjusted(e.target.value)} placeholder="0" />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="ad-notes">Notes</Label>
          <Textarea id="ad-notes" className="mt-1" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={saveAdvance.isPending}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saveAdvance.isPending}>
          {saveAdvance.isPending ? "Saving…" : "Save advance"}
        </Button>
      </div>
    </Dialog>
  )
}
