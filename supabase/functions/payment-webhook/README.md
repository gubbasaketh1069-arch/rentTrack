# `payment-webhook` — UPI autopay webhook receiver

Server-side receiver for payment provider webhooks (Razorpay / Stripe).
**Never trust the client for money**: the app marks payments `SUCCESS` and
mandates `ACTIVE` only after this function verifies a provider event.

## What it does

1. Verifies the webhook signature (`PAYMENT_WEBHOOK_SECRET`). Unverifiable
   requests get a 401 and nothing is recorded.
2. Enforces idempotency on the provider's payment id — the same event can
   arrive twice; it is recorded once.
3. Resolves the mandate (our `upi_mandates.id` is passed to the provider as
   metadata `renttrack_mandate_id`) and the tenant's oldest open monthly
   record.
4. Records the payment with the spec allocation order
   (previous due → rent → current → maintenance → bore → cleaning → other).
5. Activates a `PENDING_SETUP` mandate only after a confirmed capture.

## Deploy (owner step)

```bash
supabase secrets set \
  SUPABASE_URL=https://<your-project>.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=<service-role key> \
  PAYMENT_PROVIDER=razorpay \
  PAYMENT_WEBHOOK_SECRET=<webhook secret from provider dashboard> \
  PAYMENT_KEY_SECRET=<provider secret key>

supabase functions deploy payment-webhook
```

Then register the function URL as a webhook in the provider dashboard:

- **Razorpay**: Settings → Webhooks → add URL, subscribe to
  `payment.captured`. Copy the webhook secret into
  `PAYMENT_WEBHOOK_SECRET`. When creating the mandate server-side, put the
  RentTrack mandate id in `notes.renttrack_mandate_id`.
- **Stripe**: Developers → Webhooks → add URL. The Stripe signature check
  (`Stripe-Signature` t/v1 scheme) is scaffolded in the code — wire it to
  the Stripe SDK when connecting Stripe.

## Frontend env (Vercel)

```
VITE_PAYMENT_PROVIDER=razorpay
VITE_PAYMENT_PUBLIC_KEY=<provider public/key id>
```

Until these are set, the portal shows an honest "autopay isn't connected
yet" state and mandates stay `PENDING_SETUP`. No money moves.
