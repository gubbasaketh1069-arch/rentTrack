/**
 * RentTrack `send-reminders` Edge Function (Deno).
 *
 * Scheduled sender for WhatsApp notifications. On each run it:
 *   1. Finds `notifications` rows with channel='whatsapp' AND status='pending'.
 *   2. Resolves the recipient phone number:
 *        - payment_confirmation / rent_reminder rows carry related_entity='payment'
 *          or 'monthly_record'; the phone is resolved via
 *          monthly_record -> tenancy -> tenants.primary_phone.
 *   3. Sends the row's `body` as a WhatsApp text message via the
 *      WhatsApp Business Cloud API.
 *   4. Marks the row sent (status='sent') or failed (status='failed' + error
 *      appended to the body — never silently dropped).
 *
 * Required secrets (set with `supabase secrets set` or in the dashboard):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   WHATSAPP_API_TOKEN, WHATSAPP_PHONE_NUMBER_ID
 *
 * Scheduling: Supabase Dashboard -> Edge Functions -> send-reminders ->
 * "Enroll via cron", e.g. every morning at 09:00 (`0 9 * * *`).
 *
 * NOTE: this file is shipped as code only. The owner deploys it with:
 *   supabase functions deploy send-reminders
 * It is never auto-deployed by the app build.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";

const API_VERSION = "v21.0";

interface PendingNotification {
  id: string;
  body: string | null;
  related_entity: string | null;
  related_id: string | null;
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

async function sendWhatsApp(
  token: string,
  phoneNumberId: string,
  to: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
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
          to: normalizePhone(to),
          type: "text",
          text: { body: text },
        }),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        (data as { error?: { message?: string } }).error?.message ??
        `HTTP ${res.status}`;
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/** Resolve the tenant phone for a notification via its related entity. */
async function resolvePhone(
  supabase: ReturnType<typeof createClient>,
  n: PendingNotification,
): Promise<string | null> {
  let monthlyRecordId: string | null = null;
  if (n.related_entity === "monthly_record") {
    monthlyRecordId = n.related_id;
  } else if (n.related_entity === "payment" && n.related_id) {
    const { data } = await supabase
      .from("payments")
      .select("monthly_record_id")
      .eq("id", n.related_id)
      .maybeSingle();
    monthlyRecordId = (data as { monthly_record_id: string | null } | null)
      ?.monthly_record_id ?? null;
  }
  if (!monthlyRecordId) return null;

  const { data: mr } = await supabase
    .from("monthly_records")
    .select("tenancy_id")
    .eq("id", monthlyRecordId)
    .maybeSingle();
  const tenancyId = (mr as { tenancy_id: string } | null)?.tenancy_id;
  if (!tenancyId) return null;

  const { data: tenancy } = await supabase
    .from("tenancies")
    .select("tenant_id")
    .eq("id", tenancyId)
    .maybeSingle();
  const tenantId = (tenancy as { tenant_id: string } | null)?.tenant_id;
  if (!tenantId) return null;

  const { data: tenant } = await supabase
    .from("tenants")
    .select("primary_phone")
    .eq("id", tenantId)
    .maybeSingle();
  return (tenant as { primary_phone: string | null } | null)?.primary_phone ??
    null;
}

serve(async (_req) => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const WA_TOKEN = Deno.env.get("WHATSAPP_API_TOKEN");
  const WA_PHONE_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return new Response(
      JSON.stringify({ error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" }),
      { status: 500 },
    );
  }
  if (!WA_TOKEN || !WA_PHONE_ID) {
    return new Response(
      JSON.stringify({ error: "WhatsApp not configured (missing WHATSAPP_API_TOKEN / WHATSAPP_PHONE_NUMBER_ID)" }),
      { status: 500 },
    );
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: pending, error } = await supabase
    .from("notifications")
    .select("id, body, related_entity, related_id")
    .eq("channel", "whatsapp")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const n of (pending ?? []) as PendingNotification[]) {
    if (!n.body) {
      skipped++;
      continue;
    }
    const phone = await resolvePhone(supabase, n);
    if (!phone) {
      await supabase
        .from("notifications")
        .update({
          status: "failed",
          body: `${n.body}\n\n[send-reminders: no recipient phone number found]`,
        })
        .eq("id", n.id);
      failed++;
      continue;
    }
    const result = await sendWhatsApp(WA_TOKEN, WA_PHONE_ID, phone, n.body);
    if (result.ok) {
      await supabase.from("notifications").update({ status: "sent" }).eq("id", n.id);
      sent++;
    } else {
      await supabase
        .from("notifications")
        .update({
          status: "failed",
          body: `${n.body}\n\n[send-reminders failed: ${result.error}]`,
        })
        .eq("id", n.id);
      failed++;
    }
  }

  return new Response(JSON.stringify({ sent, failed, skipped }), {
    headers: { "Content-Type": "application/json" },
  });
});
