import { useEffect, useRef, useState } from "react"
import { Paperclip, X } from "lucide-react"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import {
  EXPENSE_CATEGORIES,
  deleteReceiptFile,
  uploadExpenseReceipt,
  useCreateExpense,
  useUpdateExpense,
  type Expense,
  type ExpenseCategory,
} from "@/hooks/useExpenseData"
import { useFlats, useMyProperties } from "@/hooks/usePropertyData"

interface ExpenseDialogProps {
  open: boolean
  onClose: () => void
  expense?: Expense | null
  defaultPropertyId?: string
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function ExpenseDialog({
  open,
  onClose,
  expense,
  defaultPropertyId,
}: ExpenseDialogProps) {
  const { toast } = useToast()
  const properties = useMyProperties()
  const isEdit = !!expense

  const [propertyId, setPropertyId] = useState(
    expense?.property_id ?? defaultPropertyId ?? ""
  )
  const [flatId, setFlatId] = useState(expense?.flat_id ?? "")
  const [date, setDate] = useState(expense?.date ?? todayISO())
  const [category, setCategory] = useState<ExpenseCategory>(
    expense?.category ?? "Repairs"
  )
  const [amount, setAmount] = useState(
    expense ? String(expense.amount) : ""
  )
  const [description, setDescription] = useState(expense?.description ?? "")
  const [file, setFile] = useState<File | null>(null)
  const [removeReceipt, setRemoveReceipt] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const flats = useFlats(propertyId || undefined)
  const createMutation = useCreateExpense()
  const updateMutation = useUpdateExpense()

  // Reset when the dialog opens for a different expense.
  useEffect(() => {
    if (!open) return
    setPropertyId(expense?.property_id ?? defaultPropertyId ?? "")
    setFlatId(expense?.flat_id ?? "")
    setDate(expense?.date ?? todayISO())
    setCategory(expense?.category ?? "Repairs")
    setAmount(expense ? String(expense.amount) : "")
    setDescription(expense?.description ?? "")
    setFile(null)
    setRemoveReceipt(false)
    setError(null)
  }, [open, expense, defaultPropertyId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const amt = Number(amount)
    if (!propertyId) {
      setError("Choose the property this expense belongs to.")
      return
    }
    if (!Number.isFinite(amt) || amt < 0) {
      setError("Enter a valid amount (0 or more).")
      return
    }
    try {
      let receiptPath: string | null = expense?.receipt_path ?? null
      if (file) {
        // Upload first — if this fails we stop and never create the expense.
        receiptPath = await uploadExpenseReceipt(propertyId, file)
      } else if (removeReceipt && expense?.receipt_path) {
        receiptPath = null
      }
      const payload = {
        property_id: propertyId,
        flat_id: flatId || null,
        date,
        category,
        amount: amt,
        description: description.trim() || null,
        receipt_path: receiptPath,
      }
      if (isEdit) {
        await updateMutation.mutateAsync({ id: expense.id, input: payload })
        // Clean up the replaced/removed file only after the row saved.
        if (file && expense.receipt_path) {
          try {
            await deleteReceiptFile(expense.receipt_path)
          } catch {
            /* best-effort */
          }
        } else if (removeReceipt && expense.receipt_path) {
          try {
            await deleteReceiptFile(expense.receipt_path)
          } catch {
            /* best-effort */
          }
        }
        toast("success", "Expense updated.")
      } else {
        await createMutation.mutateAsync(payload)
        toast("success", "Expense recorded.")
      }
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong."
      setError(message)
      toast("error", message)
    }
  }

  const saving = createMutation.isPending || updateMutation.isPending
  const selectClass =
    "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit expense" : "Record expense"}
      description="Owner-side expenses. Kept separate from tenant rent and billing."
      wide
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="exp-property">
              Property <span className="text-destructive">*</span>
            </Label>
            <select
              id="exp-property"
              value={propertyId}
              onChange={(e) => {
                setPropertyId(e.target.value)
                setFlatId("")
              }}
              className={selectClass}
              disabled={isEdit}
            >
              <option value="">Select property…</option>
              {(properties.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="exp-flat">Flat (optional)</Label>
            <select
              id="exp-flat"
              value={flatId}
              onChange={(e) => setFlatId(e.target.value)}
              className={selectClass}
              disabled={!propertyId}
            >
              <option value="">Whole property</option>
              {(flats.data ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.flat_number}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="exp-date">Date</Label>
            <Input
              id="exp-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="exp-category">Category</Label>
            <select
              id="exp-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
              className={selectClass}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="exp-amount">
              Amount (₹) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="exp-amount"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="exp-description">Description</Label>
          <Textarea
            id="exp-description"
            placeholder="What was this expense for?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <Label>Receipt photo</Label>
          {expense?.receipt_path && !removeReceipt && !file ? (
            <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-muted-foreground">
                  Receipt attached
                </span>
              </span>
              <button
                type="button"
                onClick={() => setRemoveReceipt(true)}
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                aria-label="Remove receipt"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="cursor-pointer"
              />
              {file && (
                <button
                  type="button"
                  onClick={() => {
                    setFile(null)
                    if (fileInputRef.current) fileInputRef.current.value = ""
                  }}
                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                  aria-label="Clear selected file"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Optional. Stored privately — only people with access to this property
            can open it.
          </p>
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Record expense"}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
