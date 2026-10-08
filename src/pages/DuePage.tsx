import { Link } from "react-router-dom"
import { BellRing } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import { useDueList, useQueueRentReminders } from "@/hooks/useBillingData"
import { isWhatsAppConfigured } from "@/lib/whatsapp"
import { monthLabel } from "@/lib/billing"
import { inr } from "@/lib/format"

const STATUS_BADGE: Record<string, "paid" | "partial" | "due" | "neutral"> = {
  PAID: "paid",
  PARTIAL: "partial",
  LATE_DUE: "partial",
  DUE: "due",
}

/**
 * Owner Due page (sidebar: Due). Every active tenancy with a remaining due,
 * using only its latest monthly record — older balances are already carried
 * into it as previous due, so nothing is double counted.
 */
export default function DuePage() {
  const due = useDueList()
  const queueReminders = useQueueRentReminders()
  const { toast } = useToast()
  const waConfigured = isWhatsAppConfigured()

  if (due.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (due.error) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Couldn't load dues: {(due.error as Error).message}
      </p>
    )
  }

  const { rows, total } = due.data ?? { rows: [], total: 0 }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Due</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Outstanding rent across all properties — latest bill per active tenancy.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Total outstanding</CardTitle>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-status-due">{inr(total)}</span>
            {rows.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                disabled={queueReminders.isPending}
                onClick={() =>
                  queueReminders.mutate(
                    rows.map((r) => ({
                      tenancyId: r.tenancyId,
                      tenantName: r.tenantName,
                      propertyName: r.propertyName,
                      flatNumber: r.flatNumber,
                      year: r.year,
                      month: r.month,
                      remainingDue: r.remainingDue,
                      monthlyRecordId: r.monthlyRecordId,
                    })),
                    {
                      onSuccess: (n) =>
                        toast(
                          "success",
                          n > 0
                            ? `${n} reminder${n === 1 ? "" : "s"} queued${waConfigured ? " for WhatsApp delivery" : ""}.`
                            : "Reminders already sent for all overdue bills."
                        ),
                      onError: (e) =>
                        toast("error", e instanceof Error ? e.message : "Could not queue reminders."),
                    }
                  )
                }
              >
                <BellRing className="mr-1 h-4 w-4" />
                {queueReminders.isPending ? "Queueing…" : "Send reminders"}
              </Button>
            )}
          </div>
        </CardHeader>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No outstanding dues. Everything is collected.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Tenant</th>
                    <th className="px-4 py-3 font-medium">Property · Flat</th>
                    <th className="px-4 py-3 font-medium">Month</th>
                    <th className="px-4 py-3 text-right font-medium">Payable</th>
                    <th className="px-4 py-3 text-right font-medium">Paid</th>
                    <th className="px-4 py-3 text-right font-medium">Remaining</th>
                    <th className="px-4 py-3 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.tenancyId} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-3">
                        <Link
                          to={`/tenants/${r.tenantId}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {r.tenantName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.propertyName}
                        {r.flatNumber ? ` · ${r.flatNumber}` : ""}
                      </td>
                      <td className="px-4 py-3">{monthLabel(r.year, r.month)}</td>
                      <td className="px-4 py-3 text-right">{inr(r.totalPayable)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{inr(r.totalPaid)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-status-due">
                        {inr(r.remainingDue)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Badge variant={STATUS_BADGE[r.status] ?? "neutral"}>
                          {r.status.replace("_", " ")}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
