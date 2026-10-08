/**
 * Tenant rental score — a portable payment-behavior summary.
 *
 * Pure function, no I/O. The score is a documented heuristic, not a
 * credit rating: the UI always shows the inputs it was built from
 * (on-time %, full-payment %, currently overdue months, history length),
 * so it stays honest and explainable.
 *
 * Methodology (v1):
 *  - 60 pts: on-time ratio — share of billed months whose first payment
 *    landed on or before the due date (5th of the following month).
 *  - 25 pts: full-payment ratio — share of billed months fully paid.
 *  - 15 pts: dues aging — 15 if nothing is overdue right now, scaled down
 *    by currently-overdue months (0 once 3+ months are overdue).
 *  - Tenancy length and payment count are reported as context, not scored.
 *
 * A month with no payments and no remaining due (zero bill) is skipped.
 * Months with no data yet (the current open month with no payments) are
 * skipped for on-time/full-payment but count toward "overdue now" when
 * the due date has passed and a balance remains.
 */

export type RentalGrade = "A" | "B" | "C" | "D"

export interface ScoreMonth {
  year: number
  month: number
  totalPayable: number
  /** ISO date of the first SUCCESS payment against this month, or null. */
  firstPaymentDate: string | null
  /** True when the month is fully paid (remaining <= 0). */
  fullyPaid: boolean
  /** Balance still owed right now. */
  remainingDue: number
}

export interface RentalScore {
  /** 0–100, rounded. */
  score: number
  grade: RentalGrade
  /** Share of scored months paid on time (0–100). */
  onTimePct: number
  /** Share of scored months fully paid (0–100). */
  fullPaidPct: number
  /** Months with a balance past their due date right now. */
  overdueMonths: number
  /** Months the score was computed from. */
  scoredMonths: number
  /** Total payments seen (context). */
  paymentsCount: number
  /** Whole months since the tenancy started (context). */
  tenancyMonths: number
}

/** Due date for a billing month: the 5th of the following month. */
export function dueDateForMonth(year: number, month: number): string {
  const d = new Date(year, month, 5) // month is 1-based; Date month is 0-based → next month
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  return `${y}-${m}-05`
}

export function gradeForScore(score: number): RentalGrade {
  if (score >= 85) return "A"
  if (score >= 70) return "B"
  if (score >= 50) return "C"
  return "D"
}

export const SCORE_METHODOLOGY =
  "Score = 60% on-time payments (paid by the 5th of the next month) + 25% months fully paid + 15% no overdue balance right now. It reflects recorded payments only — not a credit rating."

export function computeRentalScore(
  months: ScoreMonth[],
  paymentsCount: number,
  tenancyMonths: number
): RentalScore {
  const scored = months.filter((m) => m.totalPayable > 0.005 || m.firstPaymentDate !== null)

  let onTime = 0
  let fullyPaid = 0
  let overdueNow = 0
  const today = new Date().toISOString().slice(0, 10)

  for (const m of scored) {
    const due = dueDateForMonth(m.year, m.month)
    if (m.fullyPaid) fullyPaid++
    if (m.firstPaymentDate && m.firstPaymentDate <= due) onTime++
    if (m.remainingDue > 0.005 && today > due) overdueNow++
  }

  const n = scored.length
  const onTimeRatio = n > 0 ? onTime / n : 0
  const fullRatio = n > 0 ? fullyPaid / n : 0
  const agingPts = overdueNow === 0 ? 15 : Math.max(0, 15 - overdueNow * 5)

  const score =
    n === 0
      ? 0
      : Math.round(onTimeRatio * 60 + fullRatio * 25 + agingPts)

  return {
    score: Math.max(0, Math.min(100, score)),
    grade: n === 0 ? "D" : gradeForScore(score),
    onTimePct: n > 0 ? Math.round((onTime / n) * 100) : 0,
    fullPaidPct: n > 0 ? Math.round((fullyPaid / n) * 100) : 0,
    overdueMonths: overdueNow,
    scoredMonths: n,
    paymentsCount,
    tenancyMonths,
  }
}
