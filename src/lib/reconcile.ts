/**
 * Bank/UPI statement reconciliation — parse + auto-match engine.
 *
 * Pure functions, no I/O. The UI parses an uploaded CSV/XLSX into
 * StatementRow[], matches each row against unpaid monthly records, and
 * presents matches with confidence scores. The owner confirms each match
 * before anything is created — reconciliation never writes on its own.
 *
 * Money comparisons are paise-safe.
 */

import * as XLSX from "xlsx"
import { toPaise, toRupees } from "./billing"

/** One parsed line from a bank/UPI statement. */
export interface StatementRow {
  /** 0-based row index in the sheet (for stable keys). */
  index: number
  /** ISO date (yyyy-mm-dd) or "" when unparseable. */
  date: string
  amount: number
  reference: string | null
  narration: string | null
}

/** A monthly record the statement row could belong to. */
export interface ReconcileTarget {
  tenancyId: string
  monthlyRecordId: string
  tenantId: string
  propertyId: string
  flatId: string | null
  tenantName: string
  flatNumber: string | null
  year: number
  month: number
  /** What the tenant still owes for this month. */
  remainingDue: number
  /** Full month total (for context). */
  totalPayable: number
}

export interface MatchCandidate {
  target: ReconcileTarget
  /** 0–100. >=80 is high, 50–79 medium, below 50 weak (shown for transparency). */
  confidence: number
  reasons: string[]
}

export interface StatementMatch {
  row: StatementRow
  /** True when a SUCCESS payment with the same reference/amount already exists. */
  alreadyRecorded: boolean
  candidates: MatchCandidate[]
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const HEADER_ALIASES: Record<string, string[]> = {
  date: ["date", "txn date", "transaction date", "value date", "posting date"],
  amount: ["amount", "credit", "credit amount", "deposit", "cr amount"],
  reference: ["reference", "ref", "utr", "utn", "transaction id", "txn id", "rrn"],
  narration: ["narration", "description", "remarks", "particulars", "details"],
}

function normalizeHeader(h: unknown): string {
  return String(h ?? "").trim().toLowerCase().replace(/\s+/g, " ")
}

/** Excel serials, ISO strings, and dd/mm/yyyy are all accepted. */
export function parseStatementDate(raw: unknown): string {
  if (raw == null || raw === "") return ""
  if (typeof raw === "number" && Number.isFinite(raw)) {
    // Excel serial date.
    const d = new Date(Math.round((raw - 25569) * 86400 * 1000))
    if (Number.isNaN(d.getTime())) return ""
    return d.toISOString().slice(0, 10)
  }
  const s = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/)
  if (m) {
    const dd = m[1].padStart(2, "0")
    const mm = m[2].padStart(2, "0")
    const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${yyyy}-${mm}-${dd}`
  }
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10)
}

function parseAmount(raw: unknown): number {
  if (raw == null || raw === "") return NaN
  const s = String(raw).replace(/[₹,\s]/g, "").replace(/cr$/i, "")
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

/**
 * Parse a CSV or XLSX bank/UPI statement into StatementRow[].
 * Only credit (incoming) rows are kept — pass the raw file buffer.
 * Throws a friendly error when no usable rows are found.
 */
export function parseStatementFile(buffer: ArrayBuffer, fileName: string): StatementRow[] {
  const wb = XLSX.read(buffer, { type: "array" })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) throw new Error("The file has no sheets to read.")
  const sheet = wb.Sheets[sheetName]
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null })
  if (grid.length < 2) throw new Error("No data rows found in the statement.")

  // Find the header row: the first row that mentions a date + amount column.
  let headerIdx = -1
  for (let i = 0; i < Math.min(grid.length, 10); i++) {
    const cells = (grid[i] ?? []).map(normalizeHeader)
    const hasDate = cells.some((c) => HEADER_ALIASES.date.includes(c))
    const hasAmount = cells.some((c) => HEADER_ALIASES.amount.includes(c))
    if (hasDate && hasAmount) {
      headerIdx = i
      break
    }
  }
  if (headerIdx === -1) {
    throw new Error(
      `Couldn't find Date/Amount columns in "${fileName}". Expected headers like Date, Amount, Reference/UTR, Narration.`
    )
  }

  const headers = (grid[headerIdx] ?? []).map(normalizeHeader)
  const colFor = (key: string): number =>
    headers.findIndex((h) => HEADER_ALIASES[key].includes(h))

  const dateCol = colFor("date")
  const amountCol = colFor("amount")
  const refCol = colFor("reference")
  const narrCol = colFor("narration")

  const rows: StatementRow[] = []
  for (let r = headerIdx + 1; r < grid.length; r++) {
    const cells = grid[r] ?? []
    const amount = parseAmount(cells[amountCol])
    if (!(amount > 0)) continue // skip non-credit / empty rows
    const date = parseStatementDate(cells[dateCol])
    if (!date) continue
    const reference =
      refCol >= 0 && cells[refCol] != null ? String(cells[refCol]).trim() || null : null
    const narration =
      narrCol >= 0 && cells[narrCol] != null ? String(cells[narrCol]).trim() || null : null
    rows.push({ index: r, date, amount: toRupees(toPaise(amount)), reference, narration })
  }

  if (rows.length === 0) {
    throw new Error("No credit entries with a valid date and amount were found.")
  }
  return rows
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/** Days between two ISO dates (absolute). */
function daysBetween(a: string, b: string): number {
  return Math.abs(
    (new Date(a + "T00:00:00").getTime() - new Date(b + "T00:00:00").getTime()) /
      86_400_000
  )
}

/**
 * Match statement rows against unpaid monthly records.
 *
 * Scoring (transparent, shown in the UI):
 *  - exact amount == remaining due (within ₹1): +55
 *  - amount within 5% of remaining due: +20
 *  - statement date within ±7 days of the billing month: +15
 *  - narration mentions the tenant's name or flat number: +15
 *  - amount equals the month's full total: +10 (likely full payment)
 *
 * `existingRefs` is the set of already-recorded transaction references
 * (upper-cased) so re-imports are flagged instead of double-recorded.
 */
export function matchStatementRows(
  rows: StatementRow[],
  targets: ReconcileTarget[],
  existingRefs: Set<string>
): StatementMatch[] {
  return rows.map((row) => {
    const refUpper = row.reference?.toUpperCase() ?? null
    const alreadyRecorded = !!refUpper && existingRefs.has(refUpper)

    const candidates: MatchCandidate[] = []
    for (const t of targets) {
      const reasons: string[] = []
      let score = 0

      const rowPaise = toPaise(row.amount)
      const duePaise = toPaise(t.remainingDue)

      if (Math.abs(rowPaise - duePaise) <= 100) {
        score += 55
        reasons.push(`Amount matches the ${t.remainingDue.toFixed(2)} still due`)
      } else if (duePaise > 0 && Math.abs(rowPaise - duePaise) / duePaise <= 0.05) {
        score += 20
        reasons.push(`Amount is within 5% of the ${t.remainingDue.toFixed(2)} due`)
      }

      // Billing month window: 1st of month ± 7 days.
      const monthStart = `${t.year}-${String(t.month).padStart(2, "0")}-01`
      if (daysBetween(row.date, monthStart) <= 7) {
        score += 15
        reasons.push("Date is close to the billing month")
      }

      const narr = (row.narration ?? "").toLowerCase()
      const nameHit =
        t.tenantName.length >= 3 && narr.includes(t.tenantName.toLowerCase().split(" ")[0])
      const flatHit =
        !!t.flatNumber && narr.replace(/\s+/g, "").includes(t.flatNumber.replace(/\s+/g, "").toLowerCase())
      if (nameHit || flatHit) {
        score += 15
        reasons.push("Narration mentions the tenant/flat")
      }

      if (Math.abs(rowPaise - toPaise(t.totalPayable)) <= 100) {
        score += 10
        reasons.push("Amount equals the full month's bill")
      }

      if (score > 0) {
        candidates.push({ target: t, confidence: Math.min(score, 100), reasons })
      }
    }

    candidates.sort((a, b) => b.confidence - a.confidence)
    return { row, alreadyRecorded, candidates: candidates.slice(0, 3) }
  })
}

/** Suggested confidence label for the UI. */
export function confidenceLabel(confidence: number): "High" | "Medium" | "Low" {
  if (confidence >= 80) return "High"
  if (confidence >= 50) return "Medium"
  return "Low"
}
