import { useEffect, useMemo, useState } from "react"
import { ExternalLink, Pencil, Plus, Receipt, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/toast"
import {
  EXPENSE_CATEGORIES,
  getReceiptSignedUrl,
  useDeleteExpense,
  useExpenses,
  type Expense,
} from "@/hooks/useExpenseData"
import { useMyProperties } from "@/hooks/usePropertyData"
import { inr } from "@/lib/format"
import ExpenseDialog from "@/components/expenses/ExpenseDialog"

type RangePreset = "this-month" | "last-month" | "this-year" | "custom"

function rangeForPreset(preset: RangePreset): { from?: string; to?: string } {
  const now = new Date()
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  if (preset === "this-month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1)
    return { from: iso(from), to: iso(now) }
  }
  if (preset === "last-month") {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const to = new Date(now.getFullYear(), now.getMonth(), 0)
    return { from: iso(from), to: iso(to) }
  }
  if (preset === "this-year") {
    return { from: `${now.getFullYear()}-01-01`, to: iso(now) }
  }
  return {}
}

const PRESETS: Array<{ value: RangePreset; label: string }> = [
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "this-year", label: "This year" },
  { value: "custom", label: "Custom" },
]

export default function ExpensesPage() {
  const { toast } = useToast()
  const properties = useMyProperties()

  const [propertyId, setPropertyId] = useState("")
  const [category, setCategory] = useState("")
  const [preset, setPreset] = useState<RangePreset>("this-month")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [deleting, setDeleting] = useState<Expense | null>(null)
  const [openingReceipt, setOpeningReceipt] = useState<string | null>(null)

  const range = useMemo(
    () =>
      preset === "custom"
        ? { from: customFrom || undefined, to: customTo || undefined }
        : rangeForPreset(preset),
    [preset, customFrom, customTo]
  )

  // Debounce the description search.
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 350)
    return () => window.clearTimeout(t)
  }, [search])

  const expenses = useExpenses({
    propertyId: propertyId || undefined,
    category: category || undefined,
    from: range.from,
    to: range.to,
    search: debouncedSearch || undefined,
  })
  const deleteMutation = useDeleteExpense()

  const { total, byCategory } = useMemo(() => {
    const rows = expenses.data ?? []
    const byCat = new Map<string, number>()
    let sum = 0
    for (const e of rows) {
      const amt = Number(e.amount)
      sum += amt
      byCat.set(e.category, (byCat.get(e.category) ?? 0) + amt)
    }
    return { total: sum, byCategory: [...byCat.entries()].sort((a, b) => b[1] - a[1]) }
  }, [expenses.data])

  async function openReceipt(expense: Expense) {
    if (!expense.receipt_path) return
    setOpeningReceipt(expense.id)
    try {
      const url = await getReceiptSignedUrl(expense.receipt_path)
      window.open(url, "_blank", "noopener,noreferrer")
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not open receipt.")
    } finally {
      setOpeningReceipt(null)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    try {
      await deleteMutation.mutateAsync(deleting)
      toast("success", "Expense deleted.")
      setDeleting(null)
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not delete expense.")
    }
  }

  const selectClass =
    "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Expenses</h2>
          <p className="text-sm text-muted-foreground">
            Owner-side spending. Always separate from tenant rent and billing.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true) }}>
          <Plus className="mr-1 h-4 w-4" /> Record expense
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="exp-filter-property">Property</Label>
            <select
              id="exp-filter-property"
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className={selectClass}
            >
              <option value="">All properties</option>
              {(properties.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="exp-filter-category">Category</Label>
            <select
              id="exp-filter-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={selectClass}
            >
              <option value="">All categories</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="exp-filter-range">Period</Label>
            <select
              id="exp-filter-range"
              value={preset}
              onChange={(e) => setPreset(e.target.value as RangePreset)}
              className={selectClass}
            >
              {PRESETS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="exp-search">Search</Label>
            <Input
              id="exp-search"
              placeholder="Search description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {preset === "custom" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="exp-from">From</Label>
                <Input id="exp-from" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exp-to">To</Label>
                <Input id="exp-to" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total (filtered)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {expenses.isLoading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <div className="text-2xl font-bold">{inr(total)}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              By category
            </CardTitle>
          </CardHeader>
          <CardContent>
            {expenses.isLoading ? (
              <Skeleton className="h-8 w-40" />
            ) : byCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground">No expenses in this view.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {byCategory.map(([cat, amt]) => (
                  <Badge key={cat} variant="secondary">
                    {cat} · {inr(amt)}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Expense records</CardTitle>
          <CardDescription>
            {expenses.data ? `${expenses.data.length} record${expenses.data.length === 1 ? "" : "s"}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {expenses.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : expenses.error ? (
            <p className="text-sm text-destructive" role="alert">
              Couldn't load expenses: {(expenses.error as Error).message}
            </p>
          ) : (expenses.data ?? []).length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Receipt className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No expenses match these filters.
              </p>
              <Button variant="outline" size="sm" onClick={() => { setEditing(null); setDialogOpen(true) }}>
                <Plus className="mr-1 h-3 w-3" /> Record expense
              </Button>
            </div>
          ) : (
            <ul className="divide-y">
              {(expenses.data ?? []).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{e.category}</Badge>
                      <span className="text-sm font-medium">{inr(e.amount)}</span>
                      <span className="text-xs text-muted-foreground">
                        {e.date}
                        {e.property?.name ? ` · ${e.property.name}` : ""}
                        {e.flat?.flat_number ? ` · Flat ${e.flat.flat_number}` : ""}
                      </span>
                    </div>
                    {e.description && (
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {e.description}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {e.receipt_path && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openReceipt(e)}
                        disabled={openingReceipt === e.id}
                        title="View receipt"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setEditing(e); setDialogOpen(true) }}
                      title="Edit expense"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleting(e)}
                      title="Delete expense"
                      className="hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ExpenseDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        expense={editing}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Delete expense"
        message={`Delete this ${deleting?.category ?? ""} expense of ${deleting ? inr(deleting.amount) : ""}? Its receipt photo is removed too. This can't be undone.`}
        confirmLabel="Delete"
        confirming={deleteMutation.isPending}
      />
    </div>
  )
}
