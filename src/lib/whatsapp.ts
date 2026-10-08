/**
 * WhatsApp Business Cloud API channel for RentTrack notifications.
 *
 * Sends rent reminders and payment confirmations via the WhatsApp Business
 * Cloud API. Credentials come from environment variables:
 *   VITE_WHATSAPP_API_TOKEN         — permanent access token from Meta
 *   VITE_WHATSAPP_PHONE_NUMBER_ID   — the sender phone number ID
 *
 * When the variables are absent the channel is honestly reported as
 * "not configured": notification rows are still written (channel=whatsapp,
 * status=pending) but nothing is sent. Actual scheduled delivery runs in the
 * `send-reminders` Edge Function (supabase/functions/send-reminders),
 * which the owner deploys separately.
 */

const API_VERSION = "v21.0"

export function whatsappPhoneNumberId(): string | undefined {
  return import.meta.env.VITE_WHATSAPP_PHONE_NUMBER_ID as string | undefined
}

function whatsappApiToken(): string | undefined {
  return import.meta.env.VITE_WHATSAPP_API_TOKEN as string | undefined
}

/** True when both env vars are present. */
export function isWhatsAppConfigured(): boolean {
  return Boolean(whatsappPhoneNumberId()) && Boolean(whatsappApiToken())
}

/** Normalize an Indian phone number to WhatsApp format (country code, no +). */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  if (digits.length === 10) return `91${digits}`
  return digits
}

export interface WhatsAppResult {
  ok: boolean
  messageId?: string
  error?: string
}

/**
 * Send a plain-text WhatsApp message. Returns ok:false with a message on
 * any failure — never throws, never fakes success.
 */
export async function sendWhatsAppMessage(
  toPhone: string,
  text: string
): Promise<WhatsAppResult> {
  const phoneNumberId = whatsappPhoneNumberId()
  const token = whatsappApiToken()
  if (!phoneNumberId || !token) {
    return { ok: false, error: "WhatsApp is not configured (missing API token or phone number ID)." }
  }
  const to = normalizePhone(toPhone)
  if (!to) {
    return { ok: false, error: "Recipient phone number is empty or invalid." }
  }
  try {
    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: text },
        }),
      }
    )
    const data = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id: string }>
      error?: { message?: string }
    }
    if (!res.ok) {
      return { ok: false, error: data.error?.message ?? `WhatsApp API returned HTTP ${res.status}.` }
    }
    return { ok: true, messageId: data.messages?.[0]?.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error sending WhatsApp message." }
  }
}

/* ------------------------------------------------------------------ */
/* Message templates                                                   */
/* ------------------------------------------------------------------ */

export interface RentReminderParams {
  tenantName: string
  amount: number | string
  monthLabel: string
  propertyName: string
  flatNumber: string
}

/** Rent reminder template (amount formatted by the caller). */
export function rentReminderMessage(p: RentReminderParams): string {
  return (
    `RentTrack rent reminder\n\n` +
    `Hi ${p.tenantName}, your rent of ₹${p.amount} for ${p.monthLabel} is due.\n` +
    `Property: ${p.propertyName}\n` +
    `Flat: ${p.flatNumber}\n\n` +
    `Please pay at your earliest convenience.`
  )
}

export interface PaymentConfirmationParams {
  tenantName: string
  amount: number | string
  propertyName: string
  flatNumber: string
  method: string
  remainingDue: number | string
  status: string
}

/**
 * Payment confirmation template — matches the spec section 36 SMS format
 * so WhatsApp and SMS stay consistent.
 */
export function paymentConfirmationMessage(p: PaymentConfirmationParams): string {
  return (
    `RentTrack Payment Received\n\n` +
    `${p.tenantName} paid ₹${p.amount}\n` +
    `Property: ${p.propertyName}\n` +
    `Flat: ${p.flatNumber}\n` +
    `Method: ${p.method}\n` +
    `Remaining Due: ₹${p.remainingDue}\n` +
    `Status: ${p.status}`
  )
}
