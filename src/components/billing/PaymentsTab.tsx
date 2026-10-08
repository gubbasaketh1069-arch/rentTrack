import { useMemo, useState } from "react"
import { ChevronDown, Download, Receipt } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useMonthlyRecords, usePayments } from "@/hooks/useBillingData"
import { getReceiptSignedUrl } from "@/lib/receipts"
import { CATEGORY_LABELS, monthLabel } from "@/lib/billing"
import { inr } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/toast"

interface Props {
  tenancyId: string
  /** Overrides the default empty-state hint (owner wording mentions recording). */
  emptyHint?: string
}

const STATUS_BADGE: Record<string, "paid" | "partial" | "due" | "neutral"> = {
  SUCCESS: "paid",
  PENDING: "partial",
  FAILED: "due",
  REFUNDED: "neutral",
}

/**
 * Payments tab (spec section 22): every payment is kept permanently —
 * date, month, amount, method, transaction id, allocation breakdown
 * (expandable), status, notes.
 */
export default function PaymentsTab({ tenancyId, emptyHint }: Props) {
  const payments = usePayments(tenancyId)
  const records = useMonthlyRecords(tenancyId)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)
  const { toast } = useToast()

  async function handleReceiptDownload(paymentId: string, receiptPath: string) {
    setDownloading(paymentId)
    try {
      const url = await getReceiptSignedUrl(receiptPath)
      window.open(url, "_blank", "noopener")
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not download receipt.")
    } finally {
      setDownloading(null)
    }
  }

  const recordLabel = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of records.data ?? []) {
      map.set(r.id, monthLabel(r.year, r.month))
    }
    return map
  }, [records.data])

  if (payments.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    )
  }

  if (payments.error) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Couldn't load payments: {(payments.error as Error).message}
      </p>
    )
  }

  const list = payments.data ?? []
  if (list.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Receipt className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="max-w-sm text-sm text-muted-foreground">
            {emptyHint ?? "No payments recorded yet. Record one from the Rent & Bills tab."}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {list.map((p) => {
        const isOpen = expanded === p.id
        const allocs = [...(p.allocations ?? [])].sort(
          (a, b) =>
            Object.keys(CATEGORY_LABELS).indexOf(a.category) -
            Object.keys(CATEGORY_LABELS).indexOf(b.category)
        )
        return (
          <Card key={p.id}>
            <button
              type="button"
              className="w-full text-left"
              onClick={() => setExpanded(isOpen ? null : p.id)}
              aria-expanded={isOpen}
            >
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="flex items-center gap-3">
                  <ChevronDown
                    className={cn("h-4 w-4 text-muted-foreground transition-transform", isOpen && "rotate-180")}
                  />
                  <div>
                    <p className="font-semibold">{inr(Number(p.amount))}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.payment_date}
                      {p.monthly_record_id && recordLabel.get(p.monthly_record_id)
                        ? ` · ${recordLabel.get(p.monthly_record_id)}`
                        : ""}
                      {" · "}
                      {p.method.replace("_", " ")}
                      {p.transaction_id ? ` · ${p.transaction_id}` : ""}
                    </p>
                  </div>
                </div>
                <Badge variant={STATUS_BADGE[p.status] ?? "neutral"}>{p.status}</Badge>
              </CardContent>
            </button>
            {isOpen && (
              <CardContent className="border-t pt-3">
                {allocs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No allocation breakdown.</p>
                ) : (
                  <dl className="space-y-1.5 text-sm">
                    {allocs.map((a) => (
                      <div key={a.id} className="flex justify-between">
                        <dt className="text-muted-foreground">{CATEGORY_LABELS[a.category]}</dt>
                        <dd className="font-medium">{inr(Number(a.amount))}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {p.notes && (
                  <p className="mt-2 text-xs text-muted-foreground">Note: {p.notes}</p>
                )}
                {(p as { receipt_path?: string | null }).receipt_path ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    disabled={downloading === p.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      void handleReceiptDownload(
                        p.id,
                        (p as { receipt_path: string }).receipt_path
                      )
                    }}
                  >
                    <Download className="mr-1 h-3.5 w-3.5" />
                    {downloading === p.id ? "Preparing…" : "Download receipt"}
                  </Button>
                ) : (
                  p.status === "SUCCESS" && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Receipt not available for this payment.
                    </p>
                  )
                )}
              </CardContent>
            )}
          </Card>
        )
      })}
    </div>
  )
}
