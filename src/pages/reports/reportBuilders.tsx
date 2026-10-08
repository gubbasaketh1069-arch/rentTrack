import { format, parseISO } from "date-fns"
import { Download, Zap } from "lucide-react"
import { inr } from "@/lib/format"
import { exportToExcel, type ExportSheet } from "@/lib/exports"
import { useTenants } from "@/hooks/useTenantData"
import {
  useDueReportData,
  useMonthlyReportData,
  usePaymentReportData,
  type FinancialSummary,
  type OccupancyRow,
  type TenantFullReport,
  type TrendPoint,
} from "@/hooks/useReports"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/toast"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

export function fmtDate(v: unknown): string {
  if (!v) return "—"
  try {
    return format(typeof v === "string" ? parseISO(v) : new Date(v as string), "dd MMM yyyy")
  } catch {
    return String(v)
  }
}

export function fmtMoney(v: unknown): string {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? inr(n) : "—"
}

export function monthLabel(year: number, month: number): string {
  return format(new Date(year, month - 1, 1), "MMMM yyyy")
}

/* ------------------------------------------------------------------ */
/* Report catalogue                                                    */
/* ------------------------------------------------------------------ */

export type ReportId =
  | "tenant"
  | "property"
  | "monthly"
  | "due"
  | "payment"
  | "expense"
  | "income"
  | "occupancy"
  | "advance"

export const REPORT_TYPES: Array<{ id: ReportId; label: string; description: string }> = [
  { id: "tenant", label: "Tenant Report", description: "Full tenant dossier — 9 sheets (no Aadhaar data)." },
  { id: "property", label: "Property Report", description: "Flats, tenancies and expenses per property." },
  { id: "monthly", label: "Monthly Report", description: "All bills for a month across properties." },
  { id: "due", label: "Due Report", description: "Every outstanding bill, largest first." },
  { id: "payment", label: "Payment Report", description: "Payments with allocation breakdown." },
  { id: "expense", label: "Expense Report", description: "Owner spending by category and property." },
  { id: "income", label: "Income Report", description: "Collections, expenses and net income." },
  { id: "occupancy", label: "Occupancy Report", description: "Occupancy rate per property + vacant flats." },
  { id: "advance", label: "Advance / Deposit Report", description: "Deposits held, refunded and adjusted." },
]

/* ------------------------------------------------------------------ */
/* Parameter inputs per report type                                    */
/* ------------------------------------------------------------------ */

interface TenantLite { id: string; full_name: string }
interface PropertyLite { id: string; name: string }

export function ReportParams(props: {
  reportId: ReportId
  tenantId: string; setTenantId: (v: string) => void
  propertyId: string; setPropertyId: (v: string) => void
  year: number; setYear: (v: number) => void
  month: number; setMonth: (v: number) => void
  from: string; setFrom: (v: string) => void
  to: string; setTo: (v: string) => void
  tenants: TenantLite[]
  properties: PropertyLite[]
}) {
  const p = props
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1)
  const yearOptions = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i)
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {p.reportId === "tenant" && (
        <div className="space-y-1.5">
          <Label>Tenant</Label>
          <select
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={p.tenantId}
            onChange={(e) => p.setTenantId(e.target.value)}
          >
            <option value="">Select tenant…</option>
            {p.tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.full_name}</option>
            ))}
          </select>
        </div>
      )}
      {p.reportId === "property" && (
        <div className="space-y-1.5">
          <Label>Property</Label>
          <select
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={p.propertyId}
            onChange={(e) => p.setPropertyId(e.target.value)}
          >
            <option value="">Select property…</option>
            {p.properties.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}
      {(p.reportId === "monthly" || p.reportId === "income") && (
        <>
          <div className="space-y-1.5">
            <Label>Month</Label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={p.month}
              onChange={(e) => p.setMonth(Number(e.target.value))}
            >
              {monthOptions.map((m) => (
                <option key={m} value={m}>{monthLabel(p.year, m)}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Year</Label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={p.year}
              onChange={(e) => p.setYear(Number(e.target.value))}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </>
      )}
      {(p.reportId === "payment" || p.reportId === "expense") && (
        <>
          <div className="space-y-1.5">
            <Label>From</Label>
            <Input type="date" value={p.from} onChange={(e) => p.setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input type="date" value={p.to} onChange={(e) => p.setTo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Property (optional)</Label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={p.propertyId}
              onChange={(e) => p.setPropertyId(e.target.value)}
            >
              <option value="">All properties</option>
              {p.properties.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Row builders (shared by full reports + quick exports)               */
/* ------------------------------------------------------------------ */

export const MONTHLY_HEADERS = ["Tenant", "Flat", "Month", "Rent", "Maintenance", "Current", "Bore", "Cleaning", "Other", "Prev Due", "Payable", "Paid", "Remaining", "Status"]
export function monthlyRow(r: Record<string, unknown>): string[] {
  const t = (r.tenancy ?? {}) as Record<string, unknown>
  const tenant = (t.tenant ?? {}) as Record<string, unknown>
  const flat = (t.flat ?? {}) as Record<string, unknown>
  return [
    String(tenant.full_name ?? "—"),
    String(flat.flat_number ?? "—"),
    monthLabel(Number(r.year), Number(r.month)),
    fmtMoney(r.applicable_rent), fmtMoney(r.maintenance), fmtMoney(r.current_bill),
    fmtMoney(r.bore_bill), fmtMoney(r.cleaning), fmtMoney(r.other_charges),
    fmtMoney(r.previous_due), fmtMoney(r.total_payable), fmtMoney(r.total_paid),
    fmtMoney(r.remaining_due), String(r.status ?? "—"),
  ]
}

export const DUE_HEADERS = ["Tenant", "Phone", "Property", "Flat", "Month", "Payable", "Paid", "Remaining", "Status"]
export function dueRow(r: Record<string, unknown>): string[] {
  const t = (r.tenancy ?? {}) as Record<string, unknown>
  const tenant = (t.tenant ?? {}) as Record<string, unknown>
  const flat = (t.flat ?? {}) as Record<string, unknown>
  const prop = (t.property ?? {}) as Record<string, unknown>
  return [
    String(tenant.full_name ?? "—"), String(tenant.primary_phone ?? "—"),
    String(prop.name ?? "—"), String(flat.flat_number ?? "—"),
    monthLabel(Number(r.year), Number(r.month)),
    fmtMoney(r.total_payable), fmtMoney(r.total_paid), fmtMoney(r.remaining_due),
    String(r.status ?? "—"),
  ]
}

export const PAYMENT_HEADERS = ["Date", "Tenant", "Property", "Flat", "Amount", "Method", "Transaction ID", "Allocation", "Status"]
export function paymentRow(r: Record<string, unknown>): string[] {
  const tenant = (r.tenant ?? {}) as Record<string, unknown>
  const prop = (r.property ?? {}) as Record<string, unknown>
  const flat = (r.flat ?? {}) as Record<string, unknown>
  const allocs = ((r.payment_allocations ?? []) as Array<{ category: string; amount: number }>)
    .map((a) => `${a.category.replace(/_/g, " ")}: ${inr(Number(a.amount))}`)
    .join("; ")
  return [
    fmtDate(r.payment_date),
    String(tenant.full_name ?? "—"), String(prop.name ?? "—"), String(flat.flat_number ?? "—"),
    fmtMoney(r.amount), String(r.method ?? "—"), String(r.transaction_id ?? "—"),
    allocs || "—", String(r.status ?? "—"),
  ]
}

/* ------------------------------------------------------------------ */
/* One-click quick exports (spec §55)                                   */
/* ------------------------------------------------------------------ */

export function QuickExports() {
  const { toast } = useToast()
  const { data: tenants } = useTenants("")
  const now = new Date()
  const monthly = useMonthlyReportData(now.getFullYear(), now.getMonth() + 1)
  const due = useDueReportData()
  const payments = usePaymentReportData({
    from: format(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90), "yyyy-MM-dd"),
  })

  async function run(kind: string) {
    try {
      const stamp = format(new Date(), "yyyy-MM-dd")
      if (kind === "current-tenants") {
        const rows = (tenants ?? [])
          .filter((t) => t.activeTenancy)
          .map((t) => [
            t.full_name, t.primary_phone ?? "—",
            t.activeTenancy!.property_name ?? "—",
            t.activeTenancy!.flat_number ?? "—",
            fmtDate(t.activeTenancy!.start_date),
          ])
        exportToExcel(`renttrack-current-tenants-${stamp}`, [
          { name: "Current Tenants", headers: ["Tenant", "Phone", "Property", "Flat", "Since"], rows },
        ])
      } else if (kind === "all-tenants") {
        const rows = (tenants ?? []).map((t) => [
          t.full_name, t.primary_phone ?? "—", t.occupation ?? "—",
          t.activeTenancy ? `${t.activeTenancy.property_name} · ${t.activeTenancy.flat_number}` : "No active tenancy",
        ])
        exportToExcel(`renttrack-all-tenants-${stamp}`, [
          { name: "All Tenants", headers: ["Tenant", "Phone", "Occupation", "Current Stay"], rows },
        ])
      } else if (kind === "current-month") {
        const rows = (monthly.data ?? []).map(monthlyRow)
        exportToExcel(`renttrack-current-month-${stamp}`, [
          { name: `Bills ${monthLabel(now.getFullYear(), now.getMonth() + 1)}`, headers: MONTHLY_HEADERS, rows },
        ])
      } else if (kind === "due-tenants") {
        const rows = (due.data ?? []).map(dueRow)
        exportToExcel(`renttrack-due-tenants-${stamp}`, [
          { name: "Due Tenants", headers: DUE_HEADERS, rows },
        ])
      } else {
        const rows = (payments.data ?? []).map(paymentRow)
        exportToExcel(`renttrack-payment-history-${stamp}`, [
          { name: "Payment History (90d)", headers: PAYMENT_HEADERS, rows },
        ])
      }
      toast("success", "Excel downloaded.")
    } catch (e) {
      toast("error", (e as Error).message)
    }
  }

  const items = [
    { id: "current-tenants", label: "Current Tenants" },
    { id: "all-tenants", label: "All Tenants" },
    { id: "current-month", label: "Current Month" },
    { id: "due-tenants", label: "Due Tenants" },
    { id: "payment-history", label: "Payment History" },
  ]
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="h-4 w-4" /> Quick exports
        </CardTitle>
        <CardDescription>One-click Excel downloads of the most-used lists.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {items.map((i) => (
          <Button key={i.id} variant="outline" size="sm" onClick={() => run(i.id)}>
            <Download className="mr-2 h-3.5 w-3.5" /> {i.label}
          </Button>
        ))}
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Sheet assembly per report                                           */
/* ------------------------------------------------------------------ */

export interface SheetCtx {
  tenantReport: TenantFullReport | undefined
  propertyReport: { property: unknown; flats: unknown[]; tenancies: unknown[]; expenses: unknown[] } | undefined
  monthlyRows: Record<string, unknown>[]
  year: number; month: number
  dueRows: Record<string, unknown>[]
  paymentRows: Record<string, unknown>[]
  expenseRows: Record<string, unknown>[]
  income: FinancialSummary | undefined
  trend: TrendPoint[]
  occupancy: { rows: OccupancyRow[]; vacantFlats: Array<{ flat_number: string; property: string; rent: number }> } | undefined
  advanceRows: Record<string, unknown>[]
  from: string; to: string
}

export function buildSheets(reportId: ReportId, ctx: SheetCtx): ExportSheet[] {
  switch (reportId) {
    case "tenant": return tenantSheets(ctx)
    case "property": return propertySheets(ctx)
    case "monthly": return [{ name: `Bills ${monthLabel(ctx.year, ctx.month)}`, headers: MONTHLY_HEADERS, rows: ctx.monthlyRows.map(monthlyRow) }]
    case "due": return [{ name: "Due Report", headers: DUE_HEADERS, rows: ctx.dueRows.map(dueRow) }]
    case "payment": return [{ name: `Payments ${ctx.from} to ${ctx.to}`, headers: PAYMENT_HEADERS, rows: ctx.paymentRows.map(paymentRow) }]
    case "expense": return [expenseSheet(ctx)]
    case "income": return incomeSheets(ctx)
    case "occupancy": return occupancySheets(ctx)
    case "advance": return [advanceSheet(ctx)]
  }
}

function tenantSheets(ctx: SheetCtx): ExportSheet[] {
  const r = ctx.tenantReport
  if (!r || !r.tenant) return []
  const t = r.tenant as Record<string, unknown>
  const firstTenancy = (r.tenancies[0] ?? {}) as Record<string, unknown>
  const details: ExportSheet = {
    name: "Tenant Details",
    headers: ["Field", "Value"],
    rows: [
      ["Full Name", String(t.full_name ?? "—")],
      ["Primary Phone", String(t.primary_phone ?? "—")],
      ["Address", String(t.address ?? "—")],
      ["Occupation", String(t.occupation ?? "—")],
      ["Place of Work", String(t.place_of_work ?? "—")],
      ["Tenant Since", fmtDate(firstTenancy.start_date)],
      ["Notes", String(t.notes ?? "—")],
    ],
  }
  const tenancy: ExportSheet = {
    name: "Tenancy History",
    headers: ["Property", "Flat", "Start Date", "End Date", "Status", "Exit Reason", "Entry Notes"],
    rows: r.tenancies.map((x) => {
      const xr = x as Record<string, unknown>
      const prop = (xr.property ?? {}) as Record<string, unknown>
      const flat = (xr.flat ?? {}) as Record<string, unknown>
      return [
        String(prop.name ?? "—"), String(flat.flat_number ?? "—"),
        fmtDate(xr.start_date), fmtDate(xr.end_date),
        String(xr.status ?? "—"), String(xr.exit_reason ?? "—"), String(xr.entry_notes ?? "—"),
      ]
    }),
  }
  const rent: ExportSheet = {
    name: "Rent History",
    headers: ["Effective Date", "Old Rent", "New Rent", "Reason", "Notes"],
    rows: r.rentHistory.map((x) => [
      fmtDate(x.effective_date), fmtMoney(x.old_rent), fmtMoney(x.new_rent),
      String(x.reason ?? "—"), String(x.notes ?? "—"),
    ]),
  }
  const bills: ExportSheet = {
    name: "Monthly Rent & Bills",
    headers: MONTHLY_HEADERS,
    rows: r.monthlyRecords.map((x) => monthlyRow({ ...x, tenancy: firstTenancy })),
  }
  const payments: ExportSheet = {
    name: "Payments",
    headers: PAYMENT_HEADERS,
    rows: r.payments.map((x) => paymentRow(x as Record<string, unknown>)),
  }
  const dues: ExportSheet = {
    name: "Due History",
    headers: ["Month", "Total Payable", "Total Paid", "Remaining Due", "Status"],
    rows: r.monthlyRecords
      .filter((x) => Number(x.remaining_due ?? 0) > 0)
      .map((x) => [
        monthLabel(Number(x.year), Number(x.month)),
        fmtMoney(x.total_payable), fmtMoney(x.total_paid), fmtMoney(x.remaining_due),
        String(x.status ?? "—"),
      ]),
  }
  // Family members — Aadhaar numbers are NEVER exported.
  const family: ExportSheet = {
    name: "Family Members",
    headers: ["Name", "Relationship", "Age", "Occupation", "Phone", "Joined", "Left"],
    rows: r.family.map((x) => [
      String(x.name ?? "—"), String(x.relationship ?? "—"), String(x.age ?? "—"),
      String(x.occupation ?? "—"), String(x.phone ?? "—"),
      fmtDate(x.joined_date), fmtDate(x.left_date),
    ]),
  }
  const meterRows: string[][] = []
  for (const m of r.meters) {
    const readings = ((m.meter_readings ?? []) as Array<Record<string, unknown>>)
    if (readings.length === 0) {
      meterRows.push([String(m.meter_number ?? "—"), String(m.meter_type ?? "—"), "—", "—", "—", "—"])
    }
    for (const rd of readings) {
      meterRows.push([
        String(m.meter_number ?? "—"), String(m.meter_type ?? "—"),
        fmtDate(rd.reading_date), String(rd.previous_reading ?? "—"),
        String(rd.current_reading ?? "—"), String(rd.units_used ?? "—"),
      ])
    }
  }
  const meters: ExportSheet = {
    name: "Meter History",
    headers: ["Meter No", "Type", "Reading Date", "Previous", "Current", "Units"],
    rows: meterRows,
  }
  const advances: ExportSheet = {
    name: "Advance & Deposit History",
    headers: ["Agreed", "Received", "Received Date", "Refunded", "Refund Date", "Adjusted", "Status", "Notes"],
    rows: r.advances.map((x) => [
      fmtMoney(x.agreed_amount), fmtMoney(x.amount_received), fmtDate(x.received_date),
      fmtMoney(x.refunded_amount), fmtDate(x.refund_date), fmtMoney(x.adjusted_amount),
      String(x.status ?? "—"), String(x.notes ?? "—"),
    ]),
  }
  return [details, tenancy, rent, bills, payments, dues, family, meters, advances]
}

function propertySheets(ctx: SheetCtx): ExportSheet[] {
  const r = ctx.propertyReport
  if (!r) return []
  const p = (r.property ?? {}) as Record<string, unknown>
  const details: ExportSheet = {
    name: "Property Details",
    headers: ["Field", "Value"],
    rows: [
      ["Name", String(p.name ?? "—")],
      ["Type", String(p.property_type ?? "—")],
      ["Address", [p.address, p.area, p.locality, p.city, p.state, p.pincode].filter(Boolean).join(", ") || "—"],
      ["Landmark", String(p.landmark ?? "—")],
      ["Floor Structure", String(p.floor_structure ?? "—")],
      ["Description", String(p.description ?? "—")],
    ],
  }
  const flats: ExportSheet = {
    name: "Flats",
    headers: ["Flat No", "Floor", "BHK", "Rent", "Status", "Tenant"],
    rows: r.flats.map((f) => {
      const fr = f as Record<string, unknown>
      const floor = (fr.floor ?? {}) as Record<string, unknown>
      const active = ((fr.tenancies ?? []) as Array<Record<string, unknown>>).find((t) => t.status === "ACTIVE")
      const tenant = (active?.tenant ?? {}) as Record<string, unknown>
      return [
        String(fr.flat_number ?? "—"), String(floor.name ?? "—"), String(fr.bhk_type ?? "—"),
        fmtMoney(fr.rent), String(fr.status ?? "—"), String(tenant.full_name ?? "—"),
      ]
    }),
  }
  const tenancies: ExportSheet = {
    name: "Tenancies",
    headers: ["Tenant", "Phone", "Flat", "Start", "End", "Status"],
    rows: r.tenancies.map((x) => {
      const xr = x as Record<string, unknown>
      const tenant = (xr.tenant ?? {}) as Record<string, unknown>
      const flat = (xr.flat ?? {}) as Record<string, unknown>
      return [
        String(tenant.full_name ?? "—"), String(tenant.primary_phone ?? "—"),
        String(flat.flat_number ?? "—"), fmtDate(xr.start_date), fmtDate(xr.end_date),
        String(xr.status ?? "—"),
      ]
    }),
  }
  const expenses: ExportSheet = {
    name: "Expenses",
    headers: ["Date", "Category", "Amount", "Description"],
    rows: r.expenses.map((x) => {
      const xr = x as Record<string, unknown>
      return [fmtDate(xr.date), String(xr.category ?? "—"), fmtMoney(xr.amount), String(xr.description ?? "—")]
    }),
  }
  return [details, flats, tenancies, expenses]
}

function expenseSheet(ctx: SheetCtx): ExportSheet {
  const total = ctx.expenseRows.reduce((s, r) => s + Number(r.amount ?? 0), 0)
  return {
    name: `Expenses ${ctx.from} to ${ctx.to}`,
    headers: ["Date", "Property", "Flat", "Category", "Amount", "Description"],
    rows: [
      ...ctx.expenseRows.map((x) => {
        const prop = (x.property ?? {}) as Record<string, unknown>
        const flat = (x.flat ?? {}) as Record<string, unknown>
        return [
          fmtDate(x.date), String(prop.name ?? "—"), String(flat.flat_number ?? "—"),
          String(x.category ?? "—"), fmtMoney(x.amount), String(x.description ?? "—"),
        ]
      }),
      ["", "", "", "TOTAL", fmtMoney(total), ""],
    ],
  }
}

function incomeSheets(ctx: SheetCtx): ExportSheet[] {
  const s = ctx.income
  const summary: ExportSheet = {
    name: `Income ${monthLabel(ctx.year, ctx.month)}`,
    headers: ["Particular", "Amount"],
    rows: s
      ? [
          ["Expected Rent", fmtMoney(s.expectedRent)],
          ["Rent Collected", fmtMoney(s.rentCollected)],
          ["Maintenance Collected", fmtMoney(s.maintenanceCollected)],
          ["Other Income", fmtMoney(s.otherIncome)],
          ["Outstanding Due", fmtMoney(s.outstandingDue)],
          ["Expenses", fmtMoney(s.expenses)],
          ["Net Income (collections − expenses)", fmtMoney(s.netIncome)],
          ["Security Deposits Held (not income)", fmtMoney(s.depositsHeld)],
        ]
      : [],
  }
  const trend: ExportSheet = {
    name: "6-Month Trend",
    headers: ["Month", "Expected Rent", "Collected", "Expenses"],
    rows: ctx.trend.map((t) => [t.label, fmtMoney(t.expected), fmtMoney(t.collected), fmtMoney(t.expenses)]),
  }
  return [summary, trend]
}

function occupancySheets(ctx: SheetCtx): ExportSheet[] {
  const o = ctx.occupancy
  const perProperty: ExportSheet = {
    name: "Occupancy by Property",
    headers: ["Property", "Total Flats", "Occupied", "Vacant", "Occupancy %"],
    rows: (o?.rows ?? []).map((r) => [
      r.propertyName, String(r.total), String(r.occupied), String(r.vacant), `${r.rate}%`,
    ]),
  }
  const vacant: ExportSheet = {
    name: "Vacant Flats",
    headers: ["Property", "Flat No", "Rent"],
    rows: (o?.vacantFlats ?? []).map((f) => [f.property, f.flat_number, fmtMoney(f.rent)]),
  }
  return [perProperty, vacant]
}

function advanceSheet(ctx: SheetCtx): ExportSheet {
  return {
    name: "Advance & Deposits",
    headers: ["Tenant", "Property", "Flat", "Agreed", "Received", "Received Date", "Refunded", "Refund Date", "Adjusted", "Status"],
    rows: ctx.advanceRows.map((x) => {
      const tenant = (x.tenant ?? {}) as Record<string, unknown>
      const tenancy = (x.tenancy ?? {}) as Record<string, unknown>
      const prop = (tenancy.property ?? {}) as Record<string, unknown>
      const flat = (tenancy.flat ?? {}) as Record<string, unknown>
      return [
        String(tenant.full_name ?? "—"), String(prop.name ?? "—"), String(flat.flat_number ?? "—"),
        fmtMoney(x.agreed_amount), fmtMoney(x.amount_received), fmtDate(x.received_date),
        fmtMoney(x.refunded_amount), fmtDate(x.refund_date), fmtMoney(x.adjusted_amount),
        String(x.status ?? "—"),
      ]
    }),
  }
}
