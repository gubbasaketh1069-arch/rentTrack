import { useMemo } from "react"
import { Link } from "react-router-dom"
import { intervalToDuration } from "date-fns"
import { Building2, CalendarDays, IndianRupee, Wallet } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import TenantGate from "@/components/portal/TenantGate"
import { BILL_BADGE } from "@/components/billing/BillDetail"
import { useMonthlyRecords, useRentHistory, type MonthlyRecord } from "@/hooks/useBillingData"
import { useTenantTenancies } from "@/hooks/useTenantData"
import { currentYearMonth, monthLabel } from "@/lib/billing"
import { inr } from "@/lib/format"

/** "2 years 8 months" from a start date until today. */
function stayDuration(startDate: string): string {
  const start = new Date(`${startDate}T00:00:00`)
  const d = intervalToDuration({ start, end: new Date() })
  const parts: string[] = []
  if (d.years) parts.push(`${d.years} year${d.years === 1 ? "" : "s"}`)
  if (d.months) parts.push(`${d.months} month${d.months === 1 ? "" : "s"}`)
  if (parts.length > 0) return parts.join(" ")
  const days = d.days ?? 0
  return days <= 1 ? "Less than a day" : `${days} days`
}

function DashboardBody({
  tenantId,
  tenancyId,
  propertyName,
  flatNumber,
}: {
  tenantId: string
  tenancyId: string
  propertyName: string
  flatNumber: string
}) {
  const records = useMonthlyRecords(tenancyId)
  const history = useRentHistory(tenancyId)
  const tenancies = useTenantTenancies(tenantId)

  const now = currentYearMonth()

  const currentRecord: MonthlyRecord | null = useMemo(() => {
    return (
      (records.data ?? []).find((r) => r.year === now.year && r.month === now.month) ??
      null
    )
  }, [records.data, now.year, now.month])

  const tenantSince = useMemo(() => {
    const starts = (tenancies.data ?? [])
      .map((t) => t.start_date)
      .filter(Boolean)
      .sort()
    return starts[0] ?? null
  }, [tenancies.data])

  const currentRent = useMemo(() => {
    const h = history.data ?? []
    if (h.length > 0) return Number(h[0].new_rent)
    return null
  }, [history.data])

  if (records.isLoading || tenancies.isLoading || history.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-48" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">
          {propertyName} · {flatNumber}
        </h2>
        {tenantSince && (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            Tenant since {tenantSince} · {stayDuration(tenantSince)}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <IndianRupee className="h-4 w-4" /> Current rent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-extrabold tracking-tight">
              {currentRent != null ? inr(currentRent) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">per month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Wallet className="h-4 w-4" /> {monthLabel(now.year, now.month)} payable
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-extrabold tracking-tight">
              {currentRecord ? inr(Number(currentRecord.total_payable)) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              {currentRecord ? "total for this month" : "no bill generated yet"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Paid this month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-extrabold tracking-tight text-status-paid">
              {currentRecord ? inr(Number(currentRecord.total_paid)) : "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Remaining
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-2">
            <p className="text-3xl font-extrabold tracking-tight text-status-due">
              {currentRecord ? inr(Number(currentRecord.remaining_due)) : "—"}
            </p>
            {currentRecord && (
              <Badge variant={BILL_BADGE[currentRecord.status]}>
                {currentRecord.status.replace("_", " ")}
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex items-center gap-3 py-4">
          <Building2 className="h-5 w-5 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            View the full breakdown in{" "}
            <Link to="/home/bills" className="font-medium text-primary underline-offset-4 hover:underline">
              Rent &amp; Bills
            </Link>
            , or your receipts under{" "}
            <Link to="/home/payments" className="font-medium text-primary underline-offset-4 hover:underline">
              Payments
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Tenant dashboard (spec section 32): property, flat, tenant since, current
 * rent, and this month's payable / paid / remaining / status.
 */
export default function TenantDashboardPage() {
  return (
    <TenantGate>
      {({ tenant, tenancy, tenancyLoading }) => {
        if (tenancyLoading) {
          return (
            <div className="space-y-4">
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-28" />
            </div>
          )
        }
        if (!tenancy) {
          return (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-sm font-medium">No active tenancy</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                  You don't have a flat assigned right now. Your owner will
                  add you to a flat, and your dashboard will appear here.
                </p>
              </CardContent>
            </Card>
          )
        }
        return (
          <DashboardBody
            tenantId={tenant.id}
            tenancyId={tenancy.id}
            propertyName={tenancy.property?.name ?? "—"}
            flatNumber={tenancy.flat?.flat_number ?? "—"}
          />
        )
      }}
    </TenantGate>
  )
}
