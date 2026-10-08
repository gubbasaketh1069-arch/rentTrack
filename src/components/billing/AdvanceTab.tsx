import { useMemo, useState } from "react"
import { HandCoins } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useAdvanceDeposits, useMonthlyRecords } from "@/hooks/useBillingData"
import AdvanceDialog from "@/components/billing/AdvanceDialog"
import { toPaise, toRupees } from "@/lib/billing"
import { inr } from "@/lib/format"
import type { Tenancy } from "@/hooks/useTenantData"

interface Props {
  tenancy: Tenancy
}

const STATUS_BADGE: Record<string, "paid" | "partial" | "due" | "neutral" | "info"> = {
  RECEIVED: "paid",
  PARTIALLY_RECEIVED: "partial",
  REFUNDED: "neutral",
  PARTIALLY_REFUNDED: "partial",
  ADJUSTED: "info",
  PENDING: "due",
}

/**
 * Advance / security deposit tab (spec sections 23-24). Deposits are tracked
 * separately from rent — never added to any monthly payable. When the
 * tenancy has ended, a move-out settlement summary is shown as information.
 */
export default function AdvanceTab({ tenancy }: Props) {
  const deposits = useAdvanceDeposits(tenancy.id)
  const records = useMonthlyRecords(tenancy.id)
  const [dialogOpen, setDialogOpen] = useState(false)

  const deposit = (deposits.data ?? [])[0] ?? null

  const settlement = useMemo(() => {
    if (!deposit || tenancy.status === "ACTIVE") return null
    const outstanding = (records.data ?? []).reduce(
      (s, r) => s + Math.max(0, toPaise(r.remaining_due)),
      0
    )
    const received = toPaise(deposit.amount_received)
    const adjusted = toPaise(deposit.adjusted_amount)
    const refunded = toPaise(deposit.refunded_amount)
    return {
      received: toRupees(received),
      outstanding: toRupees(outstanding),
      adjusted: toRupees(adjusted),
      refunded: toRupees(refunded),
      suggested: toRupees(received - outstanding - adjusted),
    }
  }, [deposit, records.data, tenancy.status])

  if (deposits.isLoading) {
    return <Skeleton className="h-48" />
  }

  if (deposits.error) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Couldn't load advance records: {(deposits.error as Error).message}
      </p>
    )
  }

  return (
    <div className="space-y-6">
      {!deposit ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <HandCoins className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="max-w-sm text-sm text-muted-foreground">
              No advance or security deposit recorded for this tenancy.
            </p>
            <Button onClick={() => setDialogOpen(true)}>Record advance</Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CardTitle className="text-base">Security deposit</CardTitle>
              <Badge variant={STATUS_BADGE[deposit.status] ?? "neutral"}>
                {deposit.status.replace(/_/g, " ")}
              </Badge>
            </div>
            <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
              Update
            </Button>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Agreed</dt>
                <dd className="mt-1 font-semibold">{inr(Number(deposit.agreed_amount))}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Received</dt>
                <dd className="mt-1 font-semibold">{inr(Number(deposit.amount_received))}</dd>
                {deposit.received_date && (
                  <dd className="text-xs text-muted-foreground">{deposit.received_date}</dd>
                )}
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Refunded</dt>
                <dd className="mt-1 font-semibold">{inr(Number(deposit.refunded_amount))}</dd>
                {deposit.refund_date && (
                  <dd className="text-xs text-muted-foreground">{deposit.refund_date}</dd>
                )}
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Adjusted</dt>
                <dd className="mt-1 font-semibold">{inr(Number(deposit.adjusted_amount))}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Method</dt>
                <dd className="mt-1 font-medium">{deposit.method || "—"}</dd>
              </div>
            </dl>
            {deposit.notes && (
              <p className="mt-4 text-sm text-muted-foreground">Note: {deposit.notes}</p>
            )}
            {(deposits.data ?? []).length > 1 && (
              <p className="mt-4 text-xs text-muted-foreground">
                Showing the latest of {(deposits.data ?? []).length} deposit records. Older
                records are kept in history.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {settlement && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Move-out settlement (info)</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Advance received</dt>
                <dd className="font-medium">{inr(settlement.received)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Outstanding dues</dt>
                <dd className="font-medium">{inr(settlement.outstanding)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Adjustments (repairs etc.)</dt>
                <dd className="font-medium">{inr(settlement.adjusted)}</dd>
              </div>
              <div className="flex justify-between border-t pt-2 font-semibold">
                <dt>Suggested refund</dt>
                <dd>{inr(settlement.suggested)}</dd>
              </div>
              {settlement.refunded > 0 && (
                <div className="flex justify-between text-sm">
                  <dt className="text-muted-foreground">Already refunded</dt>
                  <dd>{inr(settlement.refunded)}</dd>
                </div>
              )}
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              Suggested only — record the actual refund with the Update button above.
            </p>
          </CardContent>
        </Card>
      )}

      <AdvanceDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        tenancyId={tenancy.id}
        existing={deposit}
      />
    </div>
  )
}
