/**
 * RentTrack `payment-webhook` Edge Function (Deno).
 *
 * Server-side receiver for payment provider webhooks (Razorpay / Stripe)
 * that drive UPI autopay. On each call it:
 *   1. Verifies the webhook signature using PAYMENT_WEBHOOK_SECRET.
 *      Unverifiable requests are rejected (401) — nothing is recorded.
 *   2. Extracts the provider's payment id + mandate reference + amount.
 *   3. Enforces idempotency: a payment with the same provider payment id
 *      (stored in payments.transaction_id) is never recorded twice.
 *   4. Finds the matching PENDING_SETUP/ACTIVE mandate and the tenant's
 *      latest open monthly record, then records the payment with the
 *      spec allocation order (previous due -> rent -> current -> maintenance
 *      -> bore -> cleaning -> other) — the same math as the client.
 *   5. Activates a PENDING_SETUP mandate only after a confirmed capture.
 *
 * The app NEVER marks a payment SUCCESS or a mandate ACTIVE without a
 * verified provider event. Client-side "success" states don't exist.
 *
 * Required secrets (set with `supabase secrets set` or in the dashboard):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   PAYMENT_PROVIDER (razorpay|stripe), PAYMENT_WEBHOOK_SECRET,
 *   PAYMENT_KEY_SECRET (provider secret for server-side verification calls)
 *
 * NOTE: this file is shipped as code only. The owner deploys it with:
 *   supabase functions deploy payment-webhook
 * and registers the function URL in the provider dashboard
 * (Razorpay: Settings -> Webhooks -> payment.captured;
 *  Stripe: Developers -> Webhooks -> mandate/payment events).
 * It is never auto-deployed by the app build.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";

/** Allocation order (spec section 18) — mirrors src/lib/billing.ts. */
const ALLOCATION_ORDER = [
  "PREVIOUS_DUE",
  "CURRENT_RENT",
  "CURRENT_BILL",
  "MAINTENANCE",
  "BORE",
  "CLEANING",
  "OTHER",
] as const;

function toPaise(n: number): number {
  return Math.round(Number(n) * 100);
}
function toRupees(paise: number): number {
  return Math.round(paise) / 100;
}

interface ProviderEvent {
  providerPaymentId: string;
  mandateRef: string | null; // our mandate row id, passed as metadata/notes
  amountRupees: number;
  status: "captured" | "failed";
}

async function verifyRazorpaySignature(
  rawBody: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex === signature;
}

function parseEvent(provider: string, body: Record<string, unknown>): ProviderEvent | null {
  if (provider === "razorpay") {
    const payload = (body as { payload?: { payment?: { entity?: Record<string, unknown> } } })
      .payload?.payment?.entity;
    if (!payload) return null;
    const status = payload["status"];
    return {
      providerPaymentId: String(payload["id"] ?? ""),
      mandateRef: (payload["notes"] as Record<string, string> | undefined)?.["renttrack_mandate_id"] ?? null,
      amountRupees: toRupees(Number(payload["amount"] ?? 0) / 100), // Razorpay sends paise
      status: status === "captured" ? "captured" : "failed",
    };
  }
  if (provider === "stripe") {
    // Stripe signature verification uses the raw body + timestamp; the
    // scaffold below accepts the event after checkStripeSignature passes.
    const data = (body as { data?: { object?: Record<string, unknown> } }).data?.object ?? {};
    return {
      providerPaymentId: String(data["id"] ?? ""),
      mandateRef: ((data["metadata"] as Record<string, string> | undefined)?.["renttrack_mandate_id"]) ?? null,
      amountRupees: toRupees(Number(data["amount_received"] ?? data["amount"] ?? 0) / 100),
      status: "captured",
    };
  }
  return null;
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const provider = (Deno.env.get("PAYMENT_PROVIDER") ?? "").toLowerCase();
  const webhookSecret = Deno.env.get("PAYMENT_WEBHOOK_SECRET") ?? "";
  if (!provider || !webhookSecret) {
    console.error("payment-webhook: provider not configured");
    return new Response("Payment provider not configured", { status: 503 });
  }

  const rawBody = await req.text();

  // --- 1. Signature verification (provider-specific) ---
  let verified = false;
  if (provider === "razorpay") {
    const signature = req.headers.get("x-razorpay-signature") ?? "";
    verified = await verifyRazorpaySignature(rawBody, signature, webhookSecret);
  } else if (provider === "stripe") {
    // Stripe: verify `Stripe-Signature` header (t + v1 scheme) against the
    // webhook secret. Kept as an explicit TODO wired to the real SDK when
    // the owner connects Stripe.
    console.error("payment-webhook: stripe signature check not yet wired");
    verified = false;
  }
  if (!verified) {
    return new Response("Invalid signature", { status: 401 });
  }

  const event = parseEvent(provider, JSON.parse(rawBody));
  if (!event || !event.providerPaymentId) {
    return new Response("Unrecognized event", { status: 400 });
  }
  if (event.status !== "captured") {
    // Failed payments are acknowledged but never recorded as SUCCESS.
    return new Response("Acknowledged (not captured)", { status: 200 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // --- 2. Idempotency: never record the same provider payment twice ---
  const { data: existing } = await supabase
    .from("payments")
    .select("id")
    .eq("transaction_id", event.providerPaymentId)
    .eq("status", "SUCCESS")
    .maybeSingle();
  if (existing) {
    return new Response("Already processed", { status: 200 });
  }

  // --- 3. Resolve the mandate + the tenant's latest open monthly record ---
  if (!event.mandateRef) {
    console.error("payment-webhook: no mandate reference in event");
    return new Response("No mandate reference", { status: 400 });
  }
  const { data: mandate, error: mandateErr } = await supabase
    .from("upi_mandates")
    .select("id, tenant_id, property_id, tenancy_id, status")
    .eq("id", event.mandateRef)
    .single();
  if (mandateErr || !mandate) {
    return new Response("Unknown mandate", { status: 400 });
  }

  const { data: record, error: recErr } = await supabase
    .from("monthly_records")
    .select("*")
    .eq("tenancy_id", mandate.tenancy_id)
    .gt("remaining_due", 0)
    .order("year", { ascending: true })
    .order("month", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (recErr || !record) {
    console.error("payment-webhook: no open monthly record for tenancy", mandate.tenancy_id);
    return new Response("No open bill", { status: 422 });
  }

  // --- 4. Allocate in spec order (mirrors src/lib/billing.ts) ---
  const buckets: Record<string, number> = {
    PREVIOUS_DUE: Number(record.previous_due),
    CURRENT_RENT: Number(record.applicable_rent),
    CURRENT_BILL: Number(record.current_bill),
    MAINTENANCE: Number(record.maintenance),
    BORE: Number(record.bore_bill),
    CLEANING: Number(record.cleaning),
    OTHER: Number(record.other_charges) + Number(record.late_fee ?? 0),
  };
  const { data: priorAllocs } = await supabase
    .from("payment_allocations")
    .select("category, amount, payment:payments!inner(monthly_record_id, status)")
    .eq("payment.monthly_record_id", record.id)
    .eq("payment.status", "SUCCESS");
  for (const a of (priorAllocs ?? []) as Array<{ category: string; amount: number }>) {
    buckets[a.category] = toRupees(toPaise(buckets[a.category] ?? 0) - toPaise(a.amount));
  }

  let remaining = toPaise(event.amountRupees);
  const allocations: Array<{ category: string; amount: number }> = [];
  for (const cat of ALLOCATION_ORDER) {
    if (remaining <= 0) break;
    const unpaid = Math.max(0, toPaise(buckets[cat] ?? 0));
    const take = Math.min(unpaid, remaining);
    if (take > 0) {
      allocations.push({ category: cat, amount: toRupees(take) });
      remaining -= take;
    }
  }
  if (remaining > 0) {
    allocations.push({ category: "OTHER", amount: toRupees(remaining) });
  }

  const { data: payment, error: payErr } = await supabase
    .from("payments")
    .insert({
      tenant_id: mandate.tenant_id,
      property_id: mandate.property_id,
      tenancy_id: mandate.tenancy_id,
      monthly_record_id: record.id,
      amount: toRupees(toPaise(event.amountRupees)),
      method: "UPI",
      payment_date: new Date().toISOString().slice(0, 10),
      transaction_id: event.providerPaymentId,
      status: "SUCCESS",
      notes: `UPI autopay via ${provider}.`,
    })
    .select()
    .single();
  if (payErr) {
    console.error("payment-webhook: payment insert failed", payErr);
    return new Response("Record failed", { status: 500 });
  }

  const { error: allocErr } = await supabase.from("payment_allocations").insert(
    allocations.map((a) => ({ payment_id: payment.id, category: a.category, amount: a.amount })),
  );
  if (allocErr) {
    console.error("payment-webhook: allocation insert failed", allocErr);
  }

  const newTotalPaid = toRupees(toPaise(record.total_paid) + toPaise(event.amountRupees));
  const newRemaining = toRupees(toPaise(record.total_payable) - newTotalPaid);
  await supabase
    .from("monthly_records")
    .update({
      total_paid: newTotalPaid,
      remaining_due: newRemaining,
      status: newRemaining <= 0 ? "PAID" : newTotalPaid > 0 ? "PARTIAL" : "DUE",
    })
    .eq("id", record.id);

  // --- 5. Activate a pending mandate only after a confirmed capture ---
  if (mandate.status === "PENDING_SETUP") {
    await supabase
      .from("upi_mandates")
      .update({
        status: "ACTIVE",
        external_mandate_id: event.providerPaymentId,
        next_debit_date: nextMonthFirst(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", mandate.id);
  }

  return new Response(JSON.stringify({ ok: true, payment_id: payment.id }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

function nextMonthFirst(): string {
  const d = new Date();
  const y = d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear();
  const m = d.getMonth() === 11 ? 0 : d.getMonth() + 1;
  return `${y}-${String(m + 1).padStart(2, "0")}-01`;
}
