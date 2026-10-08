/**
 * UPI autopay / e-mandate — architecture + honest configuration state.
 *
 * No payment provider is connected yet, so every state in the app is built
 * around that fact: mandates are stored as PENDING_SETUP and the UI says so
 * plainly. Nothing is ever marked ACTIVE (or a payment SUCCESS) without a
 * verified provider response — that verification happens server-side in
 * supabase/functions/payment-webhook (see its README).
 */

/** Supported gateway providers. Adding one means wiring its SDK + webhook. */
export const PAYMENT_PROVIDERS = ["RAZORPAY", "STRIPE"] as const
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number] | "OTHER"

export const MANDATE_STATUSES = [
  "PENDING_SETUP",
  "ACTIVE",
  "PAUSED",
  "CANCELLED",
  "FAILED",
] as const
export type MandateStatus = (typeof MANDATE_STATUSES)[number]

export const MANDATE_STATUS_LABELS: Record<MandateStatus, string> = {
  PENDING_SETUP: "Pending setup",
  ACTIVE: "Active",
  PAUSED: "Paused",
  CANCELLED: "Cancelled",
  FAILED: "Failed",
}

export interface UpiMandate {
  id: string
  tenant_id: string
  property_id: string
  tenancy_id: string | null
  provider: string
  external_mandate_id: string | null
  upi_id: string
  max_amount: number | string
  frequency: string
  status: MandateStatus
  next_debit_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface MandateInput {
  tenantId: string
  propertyId: string
  tenancyId: string | null
  provider: PaymentProvider
  upiId: string
  maxAmount: number
}

/**
 * True only when a payment provider is actually wired up.
 * Provider keys live in Vercel env (never in source). Until set, the app
 * shows an honest "UPI autopay isn't connected yet" state.
 */
export function isUpiConfigured(): boolean {
  const provider = (import.meta.env.VITE_PAYMENT_PROVIDER as string | undefined)?.trim()
  const key = (import.meta.env.VITE_PAYMENT_PUBLIC_KEY as string | undefined)?.trim()
  return !!provider && !!key
}

/** Basic UPI ID sanity check (name@bank). Not a verification — the provider verifies. */
export function isValidUpiId(upiId: string): boolean {
  return /^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/.test(upiId.trim())
}

/**
 * Whether the mandate row may be transitioned from → to.
 * PENDING_SETUP can never jump to ACTIVE from the client — only the
 * webhook (server-side, provider-confirmed) may activate it.
 */
export function canTransitionMandate(from: MandateStatus, to: MandateStatus): boolean {
  if (from === to) return false
  switch (from) {
    case "PENDING_SETUP":
      return to === "CANCELLED" // client may only cancel a pending setup
    case "ACTIVE":
      return to === "PAUSED" || to === "CANCELLED"
    case "PAUSED":
      return to === "ACTIVE" || to === "CANCELLED"
    case "CANCELLED":
    case "FAILED":
      return false
  }
}
