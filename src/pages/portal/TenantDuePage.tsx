import { useMemo } from "react"
import { CheckCircle2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import TenantGate from "@/components/portal/TenantGate"
import { BillDetail } from "@/components/billing/BillDetail"
import { useMonthlyRecords } from "@/hooks/useBillingData"
import { monthLabel } from "@/lib/billing"
import { inr } from "@/lib/format"

function DueBody({ tenancyId }: { tenancyId: string }) {
  const records = useMonthlyRecords(tenancyId)

  const latest = useMemo(() => {
    const rs = records.data ?? []
    return rs.length > 0 ? rs[0] : null // ordered newest-first by the hook
  }, [records.data])

  if (records.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-72" />
      </div>
    )
  }

  if (records.error) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Couldn't load dues: {(records.error as Error).message}
      </p>
    )
  }

  const outstanding = latest ? Number(latest.remaining_due) : 0

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Due</h2>
      <Card>
        <CardContent className="flex items-center gap-4 py-6">
          {outstanding <= 0 ? (
            <>
              <CheckCircle2 className="h-8 w-8 shrink-0 text-status-paid" />
              <div>
                <p className="font-semibold">You're all clear</p>
                <p className="text-sm text-muted-foreground">
                  No outstanding dues on your account.
                </p>
              </div>
            </>
          ) : (
            <div>
              <p className="text-sm text-muted-foreground">Total outstanding</p>
              <p className="text-4xl font-extrabold tracking-tight text-status-due">{inr(outstanding)}</p>
              {latest && (
                <p className="mt-1 text-xs text-muted-foreground">
                  as of {monthLabel(latest.year, latest.month)} — includes any
                  previous dues carried forward
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {latest && outstanding > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {monthLabel(latest.year, latest.month)} breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BillDetail record={latest} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/** Tenant's own outstanding dues, read-only. */
export default function TenantDuePage() {
  return (
    <TenantGate>
      {({ tenancy, tenancyLoading }) => {
        if (tenancyLoading) return <Skeleton className="h-48" />
        if (!tenancy) {
          return (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  No active tenancy — nothing due.
                </p>
              </CardContent>
            </Card>
          )
        }
        return <DueBody tenancyId={tenancy.id} />
      }}
    </TenantGate>
  )
}
