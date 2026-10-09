import { useMemo, useState } from "react"
import { format } from "date-fns"
import { FileSpreadsheet, FileText, Printer } from "lucide-react"
import { exportToExcel, exportToPdf, printPage, type ExportSheet } from "@/lib/exports"
import { useMyProperties } from "@/hooks/usePropertyData"
import { useTenants } from "@/hooks/useTenantData"
import {
  useAdvanceReportData,
  useCollectionTrend,
  useDueReportData,
  useExpenseReportData,
  useFinancialSummary,
  useMonthlyReportData,
  useOccupancyData,
  usePaymentReportData,
  usePropertyReportData,
  useTenantFullReport,
} from "@/hooks/useReports"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"
import {
  REPORT_TYPES,
  ReportParams,
  QuickExports,
  buildSheets,
  monthLabel,
  type ReportId,
} from "./reportBuilders"

export default function ReportsPage() {
  const { toast } = useToast()
  const [reportId, setReportId] = useState<ReportId>("tenant")
  const [tenantId, setTenantId] = useState("")
  const [propertyId, setPropertyId] = useState("")
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [from, setFrom] = useState(format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd"))
  const [to, setTo] = useState(format(now, "yyyy-MM-dd"))

  const { data: properties } = useMyProperties()
  const { data: tenants } = useTenants("")

  // All report datasets (each enabled only when its report is selected).
  const tenantReport = useTenantFullReport(reportId === "tenant" && tenantId ? tenantId : undefined)
  const propertyReport = usePropertyReportData(reportId === "property" && propertyId ? propertyId : undefined)
  const monthlyReport = useMonthlyReportData(reportId === "monthly" ? year : 0, reportId === "monthly" ? month : 0)
  const dueReport = useDueReportData()
  const paymentReport = usePaymentReportData(
    reportId === "payment" ? { from, to, propertyId: propertyId || undefined } : {}
  )
  const expenseReport = useExpenseReportData(
    reportId === "expense" ? { from, to, propertyId: propertyId || undefined } : {}
  )
  const incomeSummary = useFinancialSummary(reportId === "income" ? year : 0, reportId === "income" ? month : 0)
  const incomeTrend = useCollectionTrend(6)
  const occupancyReport = useOccupancyData()
  const advanceReport = useAdvanceReportData()

  const loading =
    tenantReport.isLoading ||
    propertyReport.isLoading ||
    monthlyReport.isLoading ||
    paymentReport.isLoading ||
    expenseReport.isLoading ||
    incomeSummary.isLoading ||
    occupancyReport.isLoading ||
    advanceReport.isLoading

  const sheets: ExportSheet[] = useMemo(
    () =>
      buildSheets(reportId, {
        tenantReport: tenantReport.data,
        propertyReport: propertyReport.data,
        monthlyRows: (monthlyReport.data ?? []) as Record<string, unknown>[],
        year,
        month,
        dueRows: (dueReport.data ?? []) as Record<string, unknown>[],
        paymentRows: (paymentReport.data ?? []) as Record<string, unknown>[],
        expenseRows: (expenseReport.data ?? []) as Record<string, unknown>[],
        income: incomeSummary.data,
        trend: incomeTrend.data ?? [],
        occupancy: occupancyReport.data,
        advanceRows: (advanceReport.data ?? []) as Record<string, unknown>[],
        from,
        to,
      }),
    [
      reportId, tenantReport.data, propertyReport.data, monthlyReport.data, year, month,
      dueReport.data, paymentReport.data, expenseReport.data, incomeSummary.data,
      incomeTrend.data, occupancyReport.data, advanceReport.data, from, to,
    ]
  )

  const title = useMemo(() => {
    const base = REPORT_TYPES.find((r) => r.id === reportId)?.label ?? "Report"
    if (reportId === "monthly" || reportId === "income") return `${base} — ${monthLabel(year, month)}`
    return base
  }, [reportId, year, month])

  const filename = useMemo(
    () => `renttrack-${reportId}-${format(new Date(), "yyyy-MM-dd")}`,
    [reportId]
  )

  const ready =
    reportId === "tenant" ? !!tenantId && !!tenantReport.data :
    reportId === "property" ? !!propertyId && !!propertyReport.data :
    true

  function doExport(kind: "excel" | "pdf") {
    if (!ready || sheets.length === 0) {
      toast("error", "Select the required filters first.")
      return
    }
    try {
      if (kind === "excel") exportToExcel(filename, sheets)
      else exportToPdf(filename, title, sheets)
      toast("success", kind === "excel" ? "Excel downloaded." : "PDF downloaded.")
    } catch (e) {
      toast("error", (e as Error).message)
    }
  }

  const preview = sheets[0]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Real data from your properties — preview on screen, then export to Excel, PDF or print.
        </p>
      </div>

      <QuickExports />

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Report types</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 p-2">
            {REPORT_TYPES.map((r) => (
              <button
                key={r.id}
                onClick={() => setReportId(r.id)}
                className={cn(
                  "rounded-md px-3 py-2 text-left text-sm transition-colors",
                  reportId === r.id
                    ? "bg-blue-600 font-medium text-white shadow-sm"
                    : "hover:bg-accent"
                )}
              >
                {r.label}
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{REPORT_TYPES.find((r) => r.id === reportId)?.label}</CardTitle>
              <CardDescription>
                {REPORT_TYPES.find((r) => r.id === reportId)?.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ReportParams
                reportId={reportId}
                tenantId={tenantId} setTenantId={setTenantId}
                propertyId={propertyId} setPropertyId={setPropertyId}
                year={year} setYear={setYear} month={month} setMonth={setMonth}
                from={from} setFrom={setFrom} to={to} setTo={setTo}
                tenants={(tenants ?? []).map((t) => ({ id: t.id, full_name: t.full_name }))}
                properties={(properties ?? []).map((p) => ({ id: p.id, name: p.name }))}
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => doExport("excel")} disabled={!ready || loading}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" /> Export Excel
                </Button>
                <Button variant="outline" onClick={() => doExport("pdf")} disabled={!ready || loading}>
                  <FileText className="mr-2 h-4 w-4" /> Export PDF
                </Button>
                <Button variant="outline" onClick={() => printPage(title)} disabled={!ready || loading}>
                  <Printer className="mr-2 h-4 w-4" /> Print
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Preview{sheets.length > 1 && preview ? ` — ${preview.name}` : ""}</CardTitle>
              <CardDescription>
                {sheets.length > 1
                  ? `Showing the first sheet of ${sheets.length}. The export contains all sheets.`
                  : "On-screen preview of the export."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : !ready ? (
                <p className="text-sm text-muted-foreground">
                  Select {reportId === "tenant" ? "a tenant" : "a property"} above to generate this report.
                </p>
              ) : !preview || preview.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data for the selected criteria.</p>
              ) : (
                <div className="print-area overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        {preview.headers.map((h) => (
                          <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.slice(0, 12).map((row, i) => (
                        <tr key={i} className="border-b last:border-0">
                          {row.map((cell, j) => (
                            <td key={j} className="px-3 py-2">{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.rows.length > 12 && (
                    <p className="px-3 py-2 text-xs text-muted-foreground">
                      Showing 12 of {preview.rows.length} rows — the export contains all rows.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
