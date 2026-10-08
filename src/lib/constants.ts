/**
 * Shared domain constants. Mirrors the CHECK constraints in
 * supabase/migrations so the UI and the database stay in sync.
 * (Plain const objects — not TS enums — to satisfy erasableSyntaxOnly.)
 */

export const FLAT_STATUSES = [
  "AVAILABLE",
  "OCCUPIED",
  "NOTICE_PERIOD",
  "MAINTENANCE",
] as const

export const TENANCY_STATUSES = ["ACTIVE", "ENDED", "CANCELLED"] as const

export const MONTHLY_RECORD_STATUSES = [
  "PAID",
  "PARTIAL",
  "LATE_DUE",
  "DUE",
] as const

export const PAYMENT_METHODS = [
  "CASH",
  "UPI",
  "BANK_TRANSFER",
  "CHEQUE",
  "OTHER",
] as const

export const PAYMENT_STATUSES = [
  "PENDING",
  "SUCCESS",
  "FAILED",
  "REFUNDED",
] as const

/** Payment allocation order (spec section 18): previous due is cleared first. */
export const ALLOCATION_CATEGORIES = [
  "PREVIOUS_DUE",
  "CURRENT_RENT",
  "CURRENT_BILL",
  "MAINTENANCE",
  "BORE",
  "CLEANING",
  "OTHER",
] as const

export const ADVANCE_STATUSES = [
  "RECEIVED",
  "PARTIALLY_RECEIVED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
  "ADJUSTED",
  "PENDING",
] as const

export const LISTING_STATUSES = [
  "DRAFT",
  "PUBLISHED",
  "PAUSED",
  "FEATURED",
  "RENTED",
  "EXPIRED",
] as const

export const INTEREST_STATUSES = [
  "NEW",
  "CONTACTED",
  "VISIT_SCHEDULED",
  "VISITED",
  "INTERESTED",
  "REJECTED",
  "CONVERTED",
] as const

export const VISIT_STATUSES = [
  "REQUESTED",
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
] as const

export const MAINTENANCE_STATUSES = [
  "OPEN",
  "ACCEPTED",
  "IN_PROGRESS",
  "RESOLVED",
  "CANCELLED",
] as const

export const PROPERTY_ROLES = [
  "PRIMARY_OWNER",
  "CO_OWNER",
  "MANAGER",
  "EDITOR",
  "VIEWER",
] as const

/** Flat feature options (spec section 8). Stored in flat_features. */
export const FLAT_FEATURES = [
  "Attached Bathroom",
  "Kitchen",
  "Balcony",
  "Parking",
  "Furnished",
  "Semi-Furnished",
  "Unfurnished",
  "Separate Entrance",
  "Water",
  "Bore",
  "Electricity",
  "Lift",
  "Security",
  "Other",
] as const

/** Quick-add presets for standard Indian floor structures (spec section 6). */
export const FLOOR_STRUCTURE_PRESETS: Record<string, string[]> = {
  G: ["Ground"],
  "G+1": ["Ground", "First"],
  "G+2": ["Ground", "First", "Second"],
  "G+3": ["Ground", "First", "Second", "Third"],
  "G+4": ["Ground", "First", "Second", "Third", "Fourth"],
}
