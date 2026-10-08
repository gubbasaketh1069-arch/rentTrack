/**
 * Shared meter bill splitting — paise-safe share computation.
 *
 * A shared meter (one electricity/bore meter serving several flats) gets its
 * total bill split across the participating flats by one of three methods:
 *   - "equal": every flat pays the same
 *   - "ratio": owner-entered weights (e.g. 2:1:1)
 *   - "units": owner-entered sub-meter units per flat
 *
 * Shares are computed in integer paise; the leftover paise from flooring
 * go to the largest fractional remainders so the shares always sum to
 * exactly the total.
 */

import { toPaise, toRupees } from "./billing"

export type SplitMethod = "equal" | "ratio" | "units"

export const SPLIT_METHOD_LABELS: Record<SplitMethod, string> = {
  equal: "Equal split",
  ratio: "Ratio (owner-entered weights)",
  units: "Units (owner-entered sub-meter readings)",
}

export interface SplitPart {
  flatId: string
  tenancyId: string
  flatNumber: string
  tenantName: string
  /** Ratio weight or units consumed — ignored for "equal". */
  weight: number
}

export interface ComputedShare extends SplitPart {
  shareAmount: number
  /** Human-readable basis, e.g. "1/3 of bill" or "120 of 360 units". */
  basis: string
}

/**
 * Compute per-flat shares of a total bill. Throws when inputs are invalid
 * (no parts, non-positive total, zero/negative weights).
 */
export function computeShares(
  totalRupees: number,
  method: SplitMethod,
  parts: SplitPart[]
): ComputedShare[] {
  const totalPaise = toPaise(totalRupees)
  if (!(totalPaise > 0)) throw new Error("Enter a bill total greater than zero.")
  if (parts.length === 0) throw new Error("Choose at least one flat to split across.")

  const weights = parts.map((p) => {
    if (method === "equal") return 1
    const w = Number(p.weight)
    if (!(w > 0)) {
      throw new Error(
        `Enter a positive ${method === "ratio" ? "weight" : "units"} value for flat ${p.flatNumber}.`
      )
    }
    return w
  })
  const weightTotal = weights.reduce((s, w) => s + w, 0)
  if (!(weightTotal > 0)) throw new Error("Weights must add up to more than zero.")

  // Floor each share, then hand leftover paise to the largest remainders.
  const floored = weights.map((w, i) => {
    const exact = (totalPaise * w) / weightTotal
    return { i, floor: Math.floor(exact), frac: exact - Math.floor(exact) }
  })
  const assigned = floored.reduce((s, f) => s + f.floor, 0)
  let leftover = totalPaise - assigned
  const byFrac = [...floored].sort((a, b) => b.frac - a.frac)
  const bonus = new Array(parts.length).fill(0)
  for (const f of byFrac) {
    if (leftover <= 0) break
    bonus[f.i]++
    leftover--
  }

  return parts.map((p, i) => {
    const sharePaise = floored[i].floor + bonus[i]
    const basis =
      method === "equal"
        ? `${i + 1} of ${parts.length} equal parts`
        : method === "ratio"
          ? `weight ${weights[i]} of ${weightTotal}`
          : `${weights[i]} of ${weightTotal} units`
    return { ...p, shareAmount: toRupees(sharePaise), basis }
  })
}

/** Sanity check: shares must sum to the total (paise-safe). */
export function sharesSumToTotal(shares: ComputedShare[], totalRupees: number): boolean {
  const sum = shares.reduce((s, sh) => s + toPaise(sh.shareAmount), 0)
  return sum === toPaise(totalRupees)
}
