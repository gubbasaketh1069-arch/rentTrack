const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

/** Format a numeric money value as Indian rupees. */
export function inr(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—"
  const n = Number(value)
  if (Number.isNaN(n)) return "—"
  return inrFormatter.format(n)
}

/** Compact location line: "Area, City" skipping blanks. */
export function locationLine(
  ...parts: Array<string | null | undefined>
): string {
  const clean = parts.map((p) => (p ?? "").trim()).filter(Boolean)
  return clean.length > 0 ? clean.join(", ") : "—"
}
