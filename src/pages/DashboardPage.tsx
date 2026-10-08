import { Link } from "react-router-dom"
import { Link as RouterLink } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  AlertCircle,
  ArrowRight,
  BedDouble,
  BellRing,
  Building2,
  IndianRupee,
  PiggyBank,
  Receipt,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth"
import { useMyProperties } from "@/hooks/usePropertyData"
import {
  useBillAnomalies,
  useCollectionTrend,
  useFinancialSummary,
  useSmartAlerts,
} from "@/hooks/useReports"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { inr } from "@/lib/format"

interface PortfolioStats {
  flatCount: number
  occupiedCount: number
  expectedRent: number
  tenantCount: number
  outstandingDue: number
  expensesThisMonth: number
}

async function fetchPortfolioStats(propertyIds: string[]): Promise<PortfolioStats> {
  if (propertyIds.length === 0) {
    return { flatCount: 0, occupiedCount: 0, expectedRent: 0, tenantCount: 0, outstandingDue: 0, expensesThisMonth: 0 }
  }
  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
  const [flatsRes, tenanciesRes, dueRes, expensesRes] = await Promise.all([
    supabase
      .from("flats")
      .select("rent, status")
      .in("property_id", propertyIds),
    supabase
      .from("tenancies")
      .select("id", { count: "exact", head: true })
      .in("property_id", propertyIds)
      .eq("status", "ACTIVE"),
    supabase
      .from("monthly_records")
      .select("remaining_due, tenancy:tenancies!inner(property_id, status)")
      .in("tenancy.property_id", propertyIds)
      .eq("tenancy.status", "ACTIVE")
      .gt("remaining_due", 0),
    supabase
      .from("expenses")
      .select("amount")
      .in("property_id", propertyIds)
      .gte("date", monthStart),
  ])
  if (flatsRes.error) throw new Error(flatsRes.error.message)
  if (tenanciesRes.error) throw new Error(tenanciesRes.error.message)
  if (dueRes.error) throw new Error(dueRes.error.message)
  if (expensesRes.error) throw new Error(expensesRes.error.message)

  const flats = flatsRes.data as Array<{ rent: number | string; status: string }>
  return {
    flatCount: flats.length,
    occupiedCount: flats.filter((f) => f.status === "OCCUPIED").length,
    expectedRent: flats.reduce((s, f) => s + Number(f.rent), 0),
    tenantCount: tenanciesRes.count ?? 0,
    outstandingDue: (dueRes.data as Array<{ remaining_due: number | string }>).reduce(
      (s, r) => s + Number(r.remaining_due),
      0
    ),
    expensesThisMonth: (expensesRes.data as Array<{ amount: number | string }>).reduce(
      (s, r) => s + Number(r.amount),
      0
    ),
  }
}

/**
 * Owner dashboard: real portfolio figures from Supabase. Every number comes
 * from the database — empty states when there is no data yet.
 */
export default function DashboardPage() {
  const { user, profile } = useAuth()
  const properties = useMyProperties()
  const stats = useQuery({
    queryKey: ["portfolio-stats", user?.id],
    queryFn: () =>
      fetchPortfolioStats((properties.data ?? []).map((p) => p.id)),
    enabled: !!user && !!properties.data,
  })

  const loading = properties.isLoading || stats.isLoading
  const s = stats.data

  const cards = [
    {
      label: "Expected Rent",
      icon: IndianRupee,
      tone: "neutral" as const,
      value: loading ? null : inr(s?.expectedRent ?? 0),
    },
    {
      label: "Outstanding Due",
      icon: AlertCircle,
      tone: "danger" as const,
      value: loading ? null : inr(s?.outstandingDue ?? 0),
    },
    {
      label: "Expenses (this month)",
      icon: Receipt,
      tone: "neutral" as const,
      value: loading ? null : inr(s?.expensesThisMonth ?? 0),
    },
    {
      label: "Total Properties",
      icon: Building2,
      tone: "neutral" as const,
      value: loading ? null : String(properties.data?.length ?? 0),
    },
    {
      label: "Flats (Occupied)",
      icon: BedDouble,
      tone: "neutral" as const,
      value: loading
        ? null
        : `${s?.flatCount ?? 0} (${s?.occupiedCount ?? 0})`,
    },
    {
      label: "Active Tenants",
      icon: Users,
      tone: "neutral" as const,
      value: loading ? null : String(s?.tenantCount ?? 0),
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          {profile?.full_name ? `Welcome, ${profile.full_name.split(" ")[0]}` : "Dashboard"}
        </h2>
        <p className="text-sm text-muted-foreground">
          Portfolio overview across all your properties.
        </p>
      </div>

      {properties.error || stats.error ? (
        <p className="text-sm text-destructive" role="alert">
          Couldn't load dashboard:{" "}
          {((properties.error ?? stats.error) as Error).message}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((stat) => (
            <Card key={stat.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.label}
                </CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {stat.value === null ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div
                    className={cn(
                      "text-3xl font-extrabold tracking-tight",
                      stat.tone === "danger" && "text-status-due"
                    )}
                  >
                    {stat.value}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Getting started
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(properties.data ?? []).length === 0 && !loading ? (
                <>
                  <CardDescription>
                    Add your first property to start tracking rent.
                  </CardDescription>
                  <Link
                    to="/properties/new"
                    className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                  >
                    Add property <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </>
              ) : (
                <Link
                  to="/properties"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  Go to properties <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <FinancialAnalytics />
      <SmartAlerts />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Financial analytics (spec §56) — all figures from real queries       */
/* ------------------------------------------------------------------ */

function FinancialAnalytics() {
  const now = new Date()
  const summary = useFinancialSummary(now.getFullYear(), now.getMonth() + 1)
  const trend = useCollectionTrend(6)
  const s = summary.data
  const loading = summary.isLoading

  const items = [
    { label: "Rent Collected", value: s ? inr(s.rentCollected) : null, icon: Wallet },
    { label: "Maintenance Collected", value: s ? inr(s.maintenanceCollected) : null, icon: Receipt },
    { label: "Other Income", value: s ? inr(s.otherIncome) : null, icon: TrendingUp },
    { label: "Net Income", value: s ? inr(s.netIncome) : null, icon: PiggyBank },
    { label: "Security Deposits Held", value: s ? inr(s.depositsHeld) : null, icon: IndianRupee, note: "Not income" },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Financial analytics</CardTitle>
        <CardDescription>
          This month's collections and income. Deposits are held separately — never counted as income.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {summary.error ? (
          <p className="text-sm text-destructive">Couldn't load analytics: {(summary.error as Error).message}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {items.map((it) => (
              <div key={it.label} className="rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">{it.label}</p>
                  <it.icon className="h-4 w-4 text-muted-foreground" />
                </div>
                {loading || it.value === null ? (
                  <Skeleton className="mt-2 h-7 w-20" />
                ) : (
                  <p className="mt-1 text-xl font-bold">{it.value}</p>
                )}
                {it.note && <p className="mt-1 text-xs text-muted-foreground">{it.note}</p>}
              </div>
            ))}
          </div>
        )}
        <div>
          <h3 className="mb-2 text-sm font-medium">Collection trend — last 6 months</h3>
          {trend.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : trend.error ? (
            <p className="text-sm text-destructive">Couldn't load trend: {(trend.error as Error).message}</p>
          ) : (trend.data ?? []).every((t) => t.expected === 0 && t.collected === 0 && t.expenses === 0) ? (
            <p className="text-sm text-muted-foreground">
              No billing data yet — the trend appears once monthly records exist.
            </p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend.data ?? []} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" fontSize={12} />
                  <YAxis fontSize={12} tickFormatter={(v: number) => `₹${Number(v) >= 1000 ? `${Math.round(Number(v) / 1000)}k` : v}`} />
                  <Tooltip formatter={(value) => inr(Number(value ?? 0))} />
                  <Legend />
                  <Bar dataKey="expected" name="Expected rent" fill="#000000" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="collected" name="Collected" fill="#06C167" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="#E11900" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Smart alerts (spec §57)                                               */
/* ------------------------------------------------------------------ */

const SEVERITY_STYLES: Record<string, string> = {
  red: "border-red-200 bg-red-50 text-red-800",
  orange: "border-amber-200 bg-amber-50 text-amber-800",
  blue: "border-neutral-200 bg-neutral-50 text-neutral-800",
}

function SmartAlerts() {
  const alerts = useSmartAlerts()
  const anomalies = useBillAnomalies()

  if (alerts.isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Alerts</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-16 w-full" /></CardContent>
      </Card>
    )
  }
  if (alerts.error) return null
  const list = alerts.data ?? []
  const weird = anomalies.data ?? []
  if (list.length === 0 && weird.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="h-4 w-4" /> Alerts
        </CardTitle>
        <CardDescription>Things that need your attention right now.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {list.map((a) => (
          <RouterLink
            key={a.kind}
            to={a.to}
            className={`rounded-lg border p-3 transition-shadow hover:shadow ${SEVERITY_STYLES[a.severity]}`}
          >
            <p className="text-sm font-semibold">{a.title}</p>
            <p className="text-sm opacity-90">{a.detail}</p>
          </RouterLink>
        ))}
        {weird.map((w) => (
          <RouterLink
            key={`anomaly-${w.tenancyId}-${w.month}`}
            to={`/tenants`}
            className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 transition-shadow hover:shadow"
          >
            <p className="text-sm font-semibold">Unusually high bill</p>
            <p className="text-sm opacity-90">
              {w.tenant} ({w.flat}) — {w.month} bill of {inr(w.total)} is unusually high
              vs the recent average of {inr(w.average)}.
            </p>
          </RouterLink>
        ))}
      </CardContent>
    </Card>
  )
}
