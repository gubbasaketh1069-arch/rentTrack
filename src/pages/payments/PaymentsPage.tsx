import { useMemo, useRef, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import { useMyProperties, useSharedProperties } from "@/hooks/usePropertyData"
import { useRecordPayment, type RecordPaymentInput } from "@/hooks/useBillingData"
import {
  useAllPayments,
  useExistingPaymentRefs,
  useReconcileTargets,
} from "@/hooks/useReconciliation"
import {
  confidenceLabel,
  matchStatementRows,
  parseStatementFile,
  type StatementMatch,
  type StatementRow,
} from "@/lib/reconcile"
import { inr } from "@/lib/format"

type Method = "UPI" | "BANK_TRANSFER"

function monthName(year: number, month: number): string {
  return `${new Date(year, month - 1, 1).toLocaleString("en", { month: "short" })} ${year}`
}

// ---------------------------------------------------------------------------
// All payments list
// ---------------------------------------------------------------------------

function PaymentsList({ propertyId }: { propertyId: string | undefined }) {
  const payments = useAllPayments(propertyId)
  if (payments.isLoading) return <Skeleton className="h-48" />
  if (payments.error)
    return (
      <p className="text-sm text-destructive" role="alert">
        Couldn't load payments: {(payments.error as Error).message}
      </p>
    )
  const rows = payments.data ?? []
  if (rows.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        No payments recorded yet. Record payments from a tenant's Rent & Bills
        tab, or import a bank statement below.
      </p>
    )
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2">Date</th>
            <th className="px-3 py-2">Tenant</th>
            <th className="px-3 py-2">Property / Flat</th>
            <th className="px-3 py-2 text-right">Amount</th>
            <th className="px-3 py-2">Method</th>
            <th className="px-3 py-2">Reference</th>
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p: Record<string, unknown>) => (
            <tr key={p.id as string} className="border-b last:border-0">
              <td className="px-3 py-2">{p.payment_date as string}</td>
              <td className="px-3 py-2 font-medium">
                {(p.tenant as { full_name: string } | null)?.full_name ?? "—"}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {(p.property as { name: string } | null)?.name ?? "—"}
                {(p.flat as { flat_number: string } | null)?.flat_number
                  ? ` · ${(p.flat as { flat_number: string }).flat_number}`
                  : ""}
              </td>
              <td className="px-3 py-2 text-right font-semibold">
                {inr(Number(p.amount))}
              </td>
              <td className="px-3 py-2">{String(p.method).replace("_", " ")}</td>
              <td className="px-3 py-2 text-muted-foreground">
                {(p.transaction_id as string | null) ?? "—"}
              </td>
              <td className="px-3 py-2">
                <Badge variant={p.status === "SUCCESS" ? "available" : "neutral"}>
                  {p.status as string}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Statement import + reconcile
// ---------------------------------------------------------------------------

function ImportStatement({ propertyId }: { propertyId: string }) {
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [rows, setRows] = useState<StatementRow[] | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [method, setMethod] = useState<Method>("UPI")
  const [chosen, setChosen] = useState<Record<number, string>>({}) // row index → monthlyRecordId
  const [applied, setApplied] = useState<Set<number>>(new Set())

  const targets = useReconcileTargets(propertyId)
  const refs = useExistingPaymentRefs(propertyId)
  const recordPayment = useRecordPayment()

  const matches: StatementMatch[] | null = useMemo(() => {
    if (!rows || !targets.data || !refs.data) return null
    return matchStatementRows(rows, targets.data, refs.data)
  }, [rows, targets.data, refs.data])

  async function handleFile(file: File) {
    setParseError(null)
    setRows(null)
    setFileName(file.name)
    setChosen({})
    setApplied(new Set())
    try {
      const buffer = await file.arrayBuffer()
      setRows(parseStatementFile(buffer, file.name))
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Could not read the file.")
    }
  }

  async function applyMatch(m: StatementMatch) {
    const recordId = chosen[m.row.index] ?? m.candidates[0]?.target.monthlyRecordId
    const target = m.candidates.find((c) => c.target.monthlyRecordId === recordId)?.target
    if (!target) {
      toast("error", "Pick a billing month for this entry first.")
      return
    }
    try {
      const input: RecordPaymentInput = {
        tenantId: target.tenantId,
        propertyId: target.propertyId,
        flatId: target.flatId,
        tenancyId: target.tenancyId,
        monthlyRecordId: target.monthlyRecordId,
        amount: m.row.amount,
        method,
        paymentDate: m.row.date,
        transactionId: m.row.reference,
        notes: `Imported from bank statement${fileName ? ` (${fileName})` : ""}.`,
      }
      await recordPayment.mutateAsync(input)
      setApplied((prev) => new Set(prev).add(m.row.index))
      toast(
        "success",
        `Recorded ₹${m.row.amount.toFixed(2)} against ${target.tenantName} (${monthName(target.year, target.month)}).`
      )
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not record payment.")
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Import a bank / UPI statement</CardTitle>
          <CardDescription>
            Upload a CSV or Excel statement. RentTrack parses the credit entries
            and suggests which tenant and month each one belongs to — you confirm
            every match before anything is recorded. Nothing is auto-created.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleFile(f)
                e.target.value = ""
              }}
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              Choose statement file
            </Button>
            <div>
              <Label htmlFor="recon-method" className="sr-only">
                Payment method for applied entries
              </Label>
              <select
                id="recon-method"
                value={method}
                onChange={(e) => setMethod(e.target.value as Method)}
                className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="UPI">UPI</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
              </select>
            </div>
          </div>
          {parseError && (
            <p className="text-sm text-destructive" role="alert">
              {parseError}
            </p>
          )}
          {rows && (
            <p className="text-sm text-muted-foreground">
              {rows.length} credit entr{rows.length === 1 ? "y" : "ies"} found in{" "}
              <span className="font-medium text-foreground">{fileName}</span>.
            </p>
          )}
        </CardContent>
      </Card>

      {matches && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Review matches</CardTitle>
            <CardDescription>
              Confidence is explained under each suggestion. Entries already
              recorded are flagged so they can't be double-counted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(targets.isLoading || refs.isLoading) && <Skeleton className="h-24" />}
            {targets.error && (
              <p className="text-sm text-destructive" role="alert">
                Couldn't load billing records: {(targets.error as Error).message}
              </p>
            )}
            <ul className="space-y-3">
              {matches.map((m) => {
                const done = applied.has(m.row.index)
                return (
                  <li key={m.row.index} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm">
                        <span className="font-semibold">₹{m.row.amount.toFixed(2)}</span>
                        <span className="ml-2 text-muted-foreground">{m.row.date}</span>
                        {m.row.reference && (
                          <span className="ml-2 text-muted-foreground">
                            Ref: {m.row.reference}
                          </span>
                        )}
                        {m.row.narration && (
                          <span className="mt-1 block max-w-xl truncate text-xs text-muted-foreground">
                            {m.row.narration}
                          </span>
                        )}
                      </div>
                      {done ? (
                        <Badge variant="available">Recorded ✓</Badge>
                      ) : m.alreadyRecorded ? (
                        <Badge variant="neutral">Already recorded — skipped</Badge>
                      ) : m.candidates.length === 0 ? (
                        <Badge variant="neutral">No match — handle manually</Badge>
                      ) : null}
                    </div>
                    {!done && !m.alreadyRecorded && m.candidates.length > 0 && (
                      <div className="mt-2 space-y-2">
                        <Label className="text-xs">Suggested billing month</Label>
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={chosen[m.row.index] ?? m.candidates[0].target.monthlyRecordId}
                            onChange={(e) =>
                              setChosen((prev) => ({ ...prev, [m.row.index]: e.target.value }))
                            }
                            className="flex h-9 max-w-xs rounded-md border border-input bg-background px-3 text-sm"
                          >
                            {m.candidates.map((c) => (
                              <option key={c.target.monthlyRecordId} value={c.target.monthlyRecordId}>
                                {c.target.tenantName} · {monthName(c.target.year, c.target.month)} ·{" "}
                                {confidenceLabel(c.confidence)} ({c.confidence}%)
                              </option>
                            ))}
                          </select>
                          <Button
                            size="sm"
                            disabled={recordPayment.isPending}
                            onClick={() => void applyMatch(m)}
                          >
                            {recordPayment.isPending ? "Recording…" : "Apply"}
                          </Button>
                        </div>
                        <ul className="space-y-1">
                          {(chosen[m.row.index]
                            ? m.candidates.filter(
                                (c) => c.target.monthlyRecordId === chosen[m.row.index]
                              )
                            : [m.candidates[0]]
                          ).map((c) => (
                            <li key={c.target.monthlyRecordId} className="text-xs text-muted-foreground">
                              Why: {c.reasons.join(" · ")}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PaymentsPage() {
  const [tab, setTab] = useState<"list" | "import">("list")
  const [propertyId, setPropertyId] = useState<string>("all")
  const myProps = useMyProperties()
  const sharedProps = useSharedProperties()
  const properties = useMemo(
    () => [...(myProps.data ?? []), ...(sharedProps.data ?? [])],
    [myProps.data, sharedProps.data]
  )

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Payments</h2>
          <p className="text-sm text-muted-foreground">
            Every recorded payment across your properties — plus bank statement
            reconciliation.
          </p>
        </div>
        <div>
          <Label htmlFor="pay-prop" className="sr-only">
            Property filter
          </Label>
          <select
            id="pay-prop"
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">All properties</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Payments sections">
        {(
          [
            { id: "list", label: "All payments" },
            { id: "import", label: "Import statement" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={
              tab === t.id
                ? "flex-1 rounded-md bg-card px-3 py-1.5 text-sm font-medium shadow-sm"
                : "flex-1 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "list" ? (
        <PaymentsList propertyId={propertyId === "all" ? undefined : propertyId} />
      ) : propertyId === "all" ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Pick one property above to import its statement — matching needs a
              property's billing records.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ImportStatement propertyId={propertyId} />
      )}
    </div>
  )
}
