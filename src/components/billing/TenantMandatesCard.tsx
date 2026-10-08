import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import { useTenantMandates, useUpdateMandateStatus } from "@/hooks/useAutopay"
import { MANDATE_STATUS_LABELS } from "@/lib/autopay"

/** Owner-side view of a tenant's UPI autopay mandates (added feature B). */
export default function TenantMandatesCard({ tenantId }: { tenantId: string }) {
  const { toast } = useToast()
  const mandates = useTenantMandates(tenantId)
  const updateStatus = useUpdateMandateStatus()

  async function handleCancel(id: string) {
    const m = (mandates.data ?? []).find((x) => x.id === id)
    if (!m) return
    try {
      await updateStatus.mutateAsync({ mandate: m, to: "CANCELLED" })
      toast("success", "Mandate cancelled.")
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not cancel.")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">UPI autopay</CardTitle>
        <CardDescription>
          E-mandates this tenant set up from their portal.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {mandates.isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : mandates.error ? (
          <p className="text-sm text-destructive" role="alert">
            Couldn't load mandates: {(mandates.error as Error).message}
          </p>
        ) : (mandates.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No mandates yet. The tenant can set one up from the portal's
            Autopay section.
          </p>
        ) : (
          <ul className="space-y-2">
            {(mandates.data ?? []).map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {m.provider} · {m.upi_id}
                  </p>
                  <p className="text-muted-foreground">
                    Up to ₹{Number(m.max_amount).toFixed(2)}/month
                    {m.next_debit_date ? ` · next debit ${m.next_debit_date}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={m.status === "ACTIVE" ? "available" : "neutral"}>
                    {MANDATE_STATUS_LABELS[m.status] ?? m.status}
                  </Badge>
                  {(m.status === "ACTIVE" || m.status === "PAUSED" || m.status === "PENDING_SETUP") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={updateStatus.isPending}
                      onClick={() => handleCancel(m.id)}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
