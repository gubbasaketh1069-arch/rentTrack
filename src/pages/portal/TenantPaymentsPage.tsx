import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import TenantGate from "@/components/portal/TenantGate"
import PaymentsTab from "@/components/billing/PaymentsTab"

/** Tenant's own payment history with allocation breakdown, read-only. */
export default function TenantPaymentsPage() {
  return (
    <TenantGate>
      {({ tenancy, tenancyLoading }) => {
        if (tenancyLoading) return <Skeleton className="h-48" />
        if (!tenancy) {
          return (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  No active tenancy — no payments to show.
                </p>
              </CardContent>
            </Card>
          )
        }
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Payments</h2>
            <PaymentsTab
              tenancyId={tenancy.id}
              emptyHint="No payments recorded yet. Your owner records payments here when they're received."
            />
          </div>
        )
      }}
    </TenantGate>
  )
}
