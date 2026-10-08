import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import {
  useMonthlyRecordPayments,
  useRecordPayment,
  type MonthlyRecord,
  type Payment,
} from "@/hooks/useBillingData"
import {
  ALLOCATION_ORDER,
  CATEGORY_LABELS,
  allocatePayment,
  monthLabel,
  toPaise,
  toRupees,
  unpaidBuckets,
} from "@/lib/billing"
import { inr } from "@/lib/format"

const METHODS: Payment["method"][] = ["CASH", "UPI", "BANK_TRANSFER", "CHEQUE", "OTHER"]

interface Props {
  open: boolean
  onClose: () => void
  record: MonthlyRecord
  context: {
    tenantId: string
    tenantName: string
    propertyId: string
    propertyName: string
    flatId: string | null
    flatNumber: string | null
    tenancyId: string
  }
}

/**
 * Record Payment (spec section 20). The PAID button never marks a month paid
 * directly — it opens this dialog. Supports full, partial, and repeat
 * payments; the amount is auto-allocated in strict spec order with a live
 * preview before saving.
 */
export default function RecordPaymentDialog({ open, onClose, record, context }: Props) {
  const { toast } = useToast()
  const recordPayment = useRecordPayment()
  const priorPayments = useMonthlyRecordPayments(open ? record.id : undefined)

  const totalPayable = Number(record.total_payable)
  const alreadyPaid = Number(record.total_paid)
  const currentDue = toRupees(Math.max(0, toPaise(totalPayable) - toPaise(alreadyPaid)))

  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState<Payment["method"]>("UPI")
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [transactionId, setTransactionId] = useState("")
  const [notes, setNotes] = useState("")

  const unpaid = useMemo(() => {
    const sums: Partial<Record<(typeof ALLOCATION_ORDER)[number], number>> = {}
    for (const p of priorPayments.data ?? []) {
      if (p.status !== "SUCCESS") continue
      for (const a of p.allocations ?? []) {
        sums[a.category] = toRupees(toPaise(sums[a.category] ?? 0) + toPaise(a.amount))
      }
    }
    return unpaidBuckets(record, sums)
  }, [priorPayments.data, record])

  const preview = useMemo(() => {
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0) return []
    return allocatePayment(n, unpaid)
  }, [amount, unpaid])

  async function handleSave() {
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0) {
      toast("error", "Enter an amount greater than zero.")
      return
    }
    if (!paymentDate) {
      toast("error", "Payment date is required.")
      return
    }
    try {
      const res = await recordPayment.mutateAsync({
        tenantId: context.tenantId,
        propertyId: context.propertyId,
        flatId: context.flatId,
        tenancyId: context.tenancyId,
        monthlyRecordId: record.id,
        amount: n,
        method,
        paymentDate,
        transactionId,
        notes,
      })
      toast(
        "success",
        `Payment of ${inr(n)} recorded. Remaining due: ${inr(res.newRemainingDue)} (${res.newStatus}).`
      )
      onClose()
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Something went wrong.")
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Record payment — ${monthLabel(record.year, record.month)}`}
      description={`${context.tenantName} · ${context.propertyName}${
        context.flatNumber ? ` · Flat ${context.flatNumber}` : ""
      }`}
      wide
    >
      <dl className="grid grid-cols-3 gap-3 rounded-xl bg-muted p-4 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Total payable</dt>
          <dd className="mt-0.5 font-semibold">{inr(totalPayable)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Already paid</dt>
          <dd className="mt-0.5 font-semibold">{inr(alreadyPaid)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Current due</dt>
          <dd className="mt-0.5 font-semibold">{inr(currentDue)}</dd>
        </div>
      </dl>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="rp-amount">Amount received *</Label>
          <Input
            id="rp-amount"
            className="mt-1"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={currentDue.toFixed(2)}
          />
        </div>
        <div>
          <Label htmlFor="rp-method">Payment method *</Label>
          <select
            id="rp-method"
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={method}
            onChange={(e) => setMethod(e.target.value as Payment["method"])}
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="rp-date">Payment date *</Label>
          <Input
            id="rp-date"
            type="date"
            className="mt-1"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="rp-txn">Transaction ID</Label>
          <Input
            id="rp-txn"
            className="mt-1"
            value={transactionId}
            onChange={(e) => setTransactionId(e.target.value)}
            placeholder="UPI ref / cheque no."
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="rp-notes">Notes</Label>
          <Textarea
            id="rp-notes"
            className="mt-1"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      {preview.length > 0 && (
        <div className="mt-4 rounded-xl border p-4">
          <p className="mb-2 text-sm font-medium">Allocation preview</p>
          <p className="mb-3 text-xs text-muted-foreground">
            Applied in order: previous due first, then rent, current bill, maintenance,
            bore, cleaning, other.
          </p>
          <dl className="space-y-1.5 text-sm">
            {preview.map((a) => (
              <div key={a.category} className="flex justify-between">
                <dt className="text-muted-foreground">
                  {CATEGORY_LABELS[a.category]}
                  {a.excess && (
                    <span className="ml-1 text-xs">(excess — beyond unpaid charges)</span>
                  )}
                </dt>
                <dd className="font-medium">{inr(a.amount)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={recordPayment.isPending}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={recordPayment.isPending}>
          {recordPayment.isPending ? "Recording…" : "Record payment"}
        </Button>
      </div>
    </Dialog>
  )
}
