/**
 * RentTrack billing core — pure functions, no I/O.
 *
 * Money is computed in integer paise to avoid floating point drift, then
 * converted back to rupees for storage (numeric(12,2)).
 *
 * Spec section 17 (the formula):
 *   total_payable = previous_due + rent + maintenance + current_bill
 *                   + bore_bill + cleaning + other_charges
 *   remaining_due = total_payable - total_paid
 *
 * Spec section 18 (allocation order):
 *   PREVIOUS_DUE -> CURRENT_RENT -> CURRENT_BILL -> MAINTENANCE
 *   -> BORE -> CLEANING -> OTHER
 */

/** Strict payment allocation order (spec section 18). */
export const ALLOCATION_ORDER = [
  "PREVIOUS_DUE",
  "CURRENT_RENT",
  "CURRENT_BILL",
  "MAINTENANCE",
  "BORE",
  "CLEANING",
  "OTHER",
] as const

export type AllocationCategory = (typeof ALLOCATION_ORDER)[number]

export const CATEGORY_LABELS: Record<AllocationCategory, string> = {
  PREVIOUS_DUE: "Previous Due",
  CURRENT_RENT: "Current Rent",
  CURRENT_BILL: "Current Bill",
  MAINTENANCE: "Maintenance",
  BORE: "Bore Bill",
  CLEANING: "Cleaning",
  OTHER: "Other Charges",
}

export type BillStatus = "PAID" | "PARTIAL" | "LATE_DUE" | "DUE"

/** Rupees -> integer paise. */
export function toPaise(rupees: number | string | null | undefined): number {
  const n = Number(rupees ?? 0)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

/** Integer paise -> rupees rounded to 2 decimals. */
export function toRupees(paise: number): number {
  return Math.round(paise) / 100
}

export interface BillCharges {
  previous_due: number
  rent: number
  maintenance: number
  current_bill: number
  bore_bill: number
  cleaning: number
  other_charges: number
  /** Late fee is billed as its own line but allocated under OTHER (last). */
  late_fee: number
}

/** Spec section 17: total payable from the charge buckets (incl. late fee). */
export function computeTotalPayable(charges: BillCharges): number {
  const total =
    toPaise(charges.previous_due) +
    toPaise(charges.rent) +
    toPaise(charges.maintenance) +
    toPaise(charges.current_bill) +
    toPaise(charges.bore_bill) +
    toPaise(charges.cleaning) +
    toPaise(charges.other_charges) +
    toPaise(charges.late_fee)
  return toRupees(total)
}

/** Spec section 17: remaining = payable - paid. May be negative (credit). */
export function computeRemainingDue(totalPayable: number, totalPaid: number): number {
  return toRupees(toPaise(totalPayable) - toPaise(totalPaid))
}

/**
 * Bill status from remaining due. LATE_DUE is the spec's term for a
 * remaining/partial amount; without due-date logic we honestly report
 * PARTIAL whenever anything was paid and a balance remains.
 */
export function billStatus(totalPayable: number, totalPaid: number): BillStatus {
  const remaining = toPaise(totalPayable) - toPaise(totalPaid)
  if (remaining <= 0) return "PAID"
  if (toPaise(totalPaid) > 0) return "PARTIAL"
  return "DUE"
}

export interface Allocation {
  category: AllocationCategory
  /** Rupees, 2 decimals. */
  amount: number
  /** True when the amount exceeds all unpaid buckets (overflow). */
  excess: boolean
}

/**
 * Distribute a payment across unpaid buckets in strict spec order.
 * Paise-safe: the example from spec section 19 —
 *   previous_due 2000 + current 9000 = 11000, pay 7000
 * yields PREVIOUS_DUE 2000, CURRENT_RENT 5000, remaining 4000.
 *
 * If the amount exceeds the total unpaid, the surplus is recorded under
 * OTHER and flagged `excess` so the UI can say so honestly instead of
 * silently dropping money.
 */
export function allocatePayment(
  amountRupees: number,
  unpaidByCategory: Partial<Record<AllocationCategory, number>>
): Allocation[] {
  let remaining = toPaise(amountRupees)
  const out: Allocation[] = []
  for (const category of ALLOCATION_ORDER) {
    if (remaining <= 0) break
    const unpaid = Math.max(0, toPaise(unpaidByCategory[category] ?? 0))
    const take = Math.min(remaining, unpaid)
    if (take > 0) {
      out.push({ category, amount: toRupees(take), excess: false })
      remaining -= take
    }
  }
  if (remaining > 0) {
    const existing = out.find((a) => a.category === "OTHER")
    if (existing) {
      existing.amount = toRupees(toPaise(existing.amount) + remaining)
      existing.excess = true
    } else {
      out.push({ category: "OTHER", amount: toRupees(remaining), excess: true })
    }
  }
  return out
}

/** Map a monthly record's stored buckets onto allocation categories. Late fee rolls into OTHER (last in allocation order). */
export function recordBuckets(record: {
  previous_due: number | string
  applicable_rent: number | string
  current_bill: number | string
  maintenance: number | string
  bore_bill: number | string
  cleaning: number | string
  other_charges: number | string
  late_fee?: number | string | null
}): Record<AllocationCategory, number> {
  return {
    PREVIOUS_DUE: Number(record.previous_due),
    CURRENT_RENT: Number(record.applicable_rent),
    CURRENT_BILL: Number(record.current_bill),
    MAINTENANCE: Number(record.maintenance),
    BORE: Number(record.bore_bill),
    CLEANING: Number(record.cleaning),
    OTHER: Number(record.other_charges) + Number(record.late_fee ?? 0),
  }
}

/** Unpaid per bucket = bucket amount minus what earlier payments allocated. */
export function unpaidBuckets(
  record: Parameters<typeof recordBuckets>[0],
  allocatedByCategory: Partial<Record<AllocationCategory, number>>
): Record<AllocationCategory, number> {
  const buckets = recordBuckets(record)
  const out = {} as Record<AllocationCategory, number>
  for (const cat of ALLOCATION_ORDER) {
    out[cat] = toRupees(
      Math.max(0, toPaise(buckets[cat]) - toPaise(allocatedByCategory[cat] ?? 0))
    )
  }
  return out
}

// ---------------------------------------------------------------------------
// Late fees (added feature)
// ---------------------------------------------------------------------------

/** Per-property late-fee configuration (mirrors properties columns). */
export interface LateFeeConfig {
  enabled: boolean
  grace_days: number
  fixed: number | string
  per_day: number | string
}

/**
 * Compute the late fee for a new monthly record.
 *
 * If the previous month still has an unpaid balance past
 * (previous month-end + grace days), the fee is
 *   fixed + per_day * days_overdue
 * Paise-safe. Returns 0 when disabled, nothing is overdue, or no fee is configured.
 */
export function computeLateFee(
  config: LateFeeConfig,
  prevRemainingDue: number | string,
  prevYear: number,
  prevMonth: number,
  today: Date = new Date()
): number {
  if (!config.enabled) return 0
  if (toPaise(prevRemainingDue) <= 0) return 0
  const fixed = toPaise(config.fixed)
  const perDay = toPaise(config.per_day)
  if (fixed <= 0 && perDay <= 0) return 0

  // Due date = last day of the previous (1-based) month + grace days.
  const prevMonthEnd = new Date(prevYear, prevMonth, 0)
  const dueDate = new Date(prevMonthEnd)
  dueDate.setDate(dueDate.getDate() + Math.max(0, Math.floor(config.grace_days)))

  const dayOnly = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const todayDate = dayOnly(today)
  const dueDateOnly = dayOnly(dueDate)
  if (todayDate <= dueDateOnly) return 0

  const daysOverdue = Math.round(
    (todayDate.getTime() - dueDateOnly.getTime()) / 86400000
  )
  return toRupees(fixed + perDay * daysOverdue)
}

// ---------------------------------------------------------------------------
// Month helpers
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

export function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`
}

export function prevMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
}

/** -1 if a<b, 0 if equal, 1 if a>b — for (year, month) pairs. */
export function compareMonth(
  a: { year: number; month: number },
  b: { year: number; month: number }
): number {
  if (a.year !== b.year) return a.year < b.year ? -1 : 1
  if (a.month !== b.month) return a.month < b.month ? -1 : 1
  return 0
}

export function currentYearMonth(): { year: number; month: number } {
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

// ---------------------------------------------------------------------------
// Advance / deposit status (spec section 23)
// ---------------------------------------------------------------------------

export type AdvanceStatus =
  | "RECEIVED"
  | "PARTIALLY_RECEIVED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED"
  | "ADJUSTED"
  | "PENDING"

/**
 * Derive the deposit status from amounts, deterministically:
 * nothing yet -> PENDING; partial receipt -> PARTIALLY_RECEIVED;
 * full refund -> REFUNDED; partial refund -> PARTIALLY_REFUNDED;
 * adjustments without full refund -> ADJUSTED; otherwise RECEIVED.
 */
export function deriveAdvanceStatus(input: {
  agreed: number
  received: number
  refunded: number
  adjusted: number
}): AdvanceStatus {
  const agreed = toPaise(input.agreed)
  const received = toPaise(input.received)
  const refunded = toPaise(input.refunded)
  const adjusted = toPaise(input.adjusted)
  if (received <= 0) return "PENDING"
  if (refunded > 0 && refunded >= received) return "REFUNDED"
  if (refunded > 0) return "PARTIALLY_REFUNDED"
  if (adjusted > 0) return "ADJUSTED"
  if (agreed > 0 && received < agreed) return "PARTIALLY_RECEIVED"
  return "RECEIVED"
}
