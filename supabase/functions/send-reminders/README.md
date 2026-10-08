# send-reminders Edge Function

Scheduled WhatsApp sender for RentTrack notifications. The app writes
notification rows with `channel='whatsapp', status='pending'` (rent reminders,
payment confirmations); this function delivers them.

## What it does

1. Picks up `notifications` rows where `channel = 'whatsapp'` and `status = 'pending'`.
2. Resolves the recipient phone via `related_entity`/`related_id`
   (`monthly_record` → tenancy → tenant's `primary_phone`; `payment` → its monthly record).
3. Sends the row's `body` as a WhatsApp text message via the WhatsApp Business Cloud API.
4. Marks rows `sent`, or `failed` with the error appended (never silently dropped).

## Prerequisites

- A Meta developer account with a WhatsApp Business Cloud API app.
- A phone number ID and a permanent access token from the Meta dashboard.

## Deploy

```bash
# From the repo root, logged in to the Supabase CLI and linked to the project:
supabase secrets set \
  WHATSAPP_API_TOKEN="<permanent access token>" \
  WHATSAPP_PHONE_NUMBER_ID="<phone number id>"

supabase functions deploy send-reminders
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by the platform automatically.

## Schedule

Supabase Dashboard → Edge Functions → `send-reminders` → **Enroll via cron**.
Suggested: daily at 09:00 — cron expression `0 9 * * *`.

## App-side configuration

The web app reads the same two values from the Vite environment for the
Settings → WhatsApp status card and the test-send button:

```bash
VITE_WHATSAPP_API_TOKEN="<permanent access token>"
VITE_WHATSAPP_PHONE_NUMBER_ID="<phone number id>"
```

Set them in the Vercel dashboard (Production + Preview) and redeploy.
Until they are set, the app honestly reports "Not configured" and no
message is ever faked as sent.
