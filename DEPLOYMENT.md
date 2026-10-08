# RentTrack — Deployment Walkthrough

End-to-end: GitHub → Vercel (frontend) + your own Supabase project (backend).

---

## 0. Only-you-can-do-this checklist

Everything else is already done in this repo. These steps need **your**
accounts and keys — nobody else can do them for you:

- [ ] **GitHub email** — share your GitHub account email so commits are
      authored as you (`git config user.email "<your-github-email>"`).
- [ ] **Migrations** — run `001` → `009` in your Supabase SQL editor, in order
      (step 3 below). Nothing works until this is done.
- [ ] **Vercel env vars** — set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
      (and optional ones) in the Vercel dashboard (step 2 below).
- [ ] **GitHub push + Vercel connect** — create the repo, push from your own
      machine, import into Vercel (steps 1–2 below).
- [ ] **WhatsApp credentials** (optional) — Meta developer dashboard:
      permanent access token + phone number ID (step 4 below).
- [ ] **Edge function deploys** (optional, needed for WhatsApp sending /
      autopay) — `supabase functions deploy send-reminders` and
      `supabase functions deploy payment-webhook` with their secrets
      (steps 5–6 below).
- [ ] **Payment provider keys** (optional) — Razorpay/Stripe dashboard keys
      + webhook URL registration (step 6 below).

---

## 1. GitHub — create the repo and push (from your own machine)

1. Create a new repository on GitHub (e.g. `renttrack`). **Do not** add a
   README, .gitignore, or license — the project already has them.
2. On your machine, in the unzipped project folder:

```bash
cd renttrack

# First time only: make commits read as YOU, never as an assistant
git config user.name "Saketh Gubba"
git config user.email "<your-github-email>"

git add -A
git commit -m "RentTrack: full build — phases 1-11"
git branch -M main
git remote add origin https://github.com/<your-username>/renttrack.git
git push -u origin main
```

Use **your GitHub account email** in the `user.email` line — that is what
links the commits to your GitHub profile in the history.

> `.env` files are git-ignored (see `.gitignore`); only `.env.example` is
> committed. Never paste real keys into the repo.

---

## 2. Vercel — deploy the frontend

1. Go to [vercel.com](https://vercel.com) → **Add New → Project** →
   **Import** your `renttrack` GitHub repo.
2. Build settings (Vercel auto-detects these — confirm they match):
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`
3. **Environment Variables** (Project → Settings → Environment Variables).
   Add for **Production** (and Preview if you want previews working):

| Name | Where to get it | Required |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | **Yes** |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → publishable key (`sb_publishable_…`) | **Yes** |
| `VITE_WHATSAPP_API_TOKEN` | Meta developer dashboard → WhatsApp Business Cloud API app → permanent token | No |
| `VITE_WHATSAPP_PHONE_NUMBER_ID` | Same Meta dashboard | No |
| `VITE_PAYMENT_PROVIDER` | `razorpay` or `stripe` | No |
| `VITE_PAYMENT_PUBLIC_KEY` | Provider dashboard (publishable/key id) | No |

4. Click **Deploy**. Without the two Supabase vars the app cannot start;
   without the optional ones the app shows honest "not configured" states
   (Settings → WhatsApp; tenant portal → Autopay) and everything else works.

---

## 3. Supabase — run the migrations (001 → 009)

In your Supabase dashboard → **SQL Editor**:

1. Open `supabase/migrations/20261007000001_core_schema.sql`, paste, **Run**.
2. Repeat for `002`, `003`, `004`, `005`, `006`, `007`, `008`, `009` —
   **strictly in order**; later files depend on earlier ones.
3. Quick verify: Table Editor should show `properties`, `flats`, `tenants`,
   `tenancies`, `monthly_records`, `payments`, `notifications`,
   `onboarding_tokens`, `upi_mandates`, `meter_splits`, and the storage
   buckets (`aadhaar-documents`, `payment-receipts`, …) under Storage.

(If you ran `001`–`007` in earlier phases, you only need `008` and `009` now.)

---

## 4. WhatsApp Business Cloud API (optional)

1. Go to [developers.facebook.com](https://developers.facebook.com) → create
   an app → add the **WhatsApp** product.
2. In the app dashboard, copy:
   - **Phone number ID** (WhatsApp → API Setup)
   - A **permanent access token** (WhatsApp → API Setup; for production,
     generate a system-user token — test tokens expire in 24h)
3. Set them in Vercel as `VITE_WHATSAPP_API_TOKEN` /
   `VITE_WHATSAPP_PHONE_NUMBER_ID` and redeploy. Settings → WhatsApp will
   flip from "Not configured" to connected, and the test-send button works.
4. For **scheduled** rent reminders, deploy the edge function (next step) —
   until then, reminders are queued with `status='pending'` and never faked
   as sent.

---

## 5. Edge function: `send-reminders` (optional, for scheduled WhatsApp)

Needs the [Supabase CLI](https://supabase.com/docs/guides/cli) logged in and
linked to your project.

```bash
cd renttrack

supabase secrets set \
  WHATSAPP_API_TOKEN="<permanent access token>" \
  WHATSAPP_PHONE_NUMBER_ID="<phone number id>"

supabase functions deploy send-reminders
```

Schedule it: Supabase Dashboard → **Edge Functions** → `send-reminders` →
**Enroll via cron**. Suggested: daily 09:00 → `0 9 * * *`.

(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform
automatically — never put the service key in the repo.)

---

## 6. Edge function: `payment-webhook` (optional, for UPI autopay)

**Never trust the client for money**: payments are marked `SUCCESS` and
mandates `ACTIVE` only after this function verifies a provider event.

```bash
cd renttrack

supabase secrets set \
  SUPABASE_URL=https://<your-project>.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=<service-role key> \
  PAYMENT_PROVIDER=razorpay \
  PAYMENT_WEBHOOK_SECRET=<webhook secret from provider dashboard> \
  PAYMENT_KEY_SECRET=<provider secret key>

supabase functions deploy payment-webhook
```

Then register the function URL as a webhook in the provider dashboard:

- **Razorpay:** Settings → Webhooks → add URL, subscribe to
  `payment.captured`. Copy the webhook secret into `PAYMENT_WEBHOOK_SECRET`.
  When creating the mandate, put the RentTrack mandate id in
  `notes.renttrack_mandate_id`.
- **Stripe:** Developers → Webhooks → add URL. The Stripe signature check
  (`Stripe-Signature` t/v1) is scaffolded in the code — wire it to the
  Stripe SDK when connecting Stripe.

Frontend: set `VITE_PAYMENT_PROVIDER` + `VITE_PAYMENT_PUBLIC_KEY` in Vercel.
Until set, the portal shows "autopay isn't connected yet" and mandates stay
`PENDING_SETUP` — no money moves.

---

## 7. Post-deploy smoke checklist

1. Open the Vercel URL → **Sign up** as Owner → you land on the dashboard.
2. **Properties → New property** → add property, floor, flat.
3. **Tenants → Add tenant** → create tenant → **Start tenancy** on the flat.
4. **Tenants → profile → Rent & Bills → New monthly record** → verify the
   bill table (previous due + rent + maintenance + current + bore + cleaning
   + other).
5. **Record payment** → Payments tab → expand it → **Download receipt** →
   PDF opens with the §35 fields.
6. Sign up a second account as **Tenant**, link it via
   **Tenants → profile → Link login**, log in as tenant → check My Flat,
   Bills, Due.
7. Reports → run **Tenant report** → export Excel once, to confirm exports.

If any step fails, the error text in the UI names the real cause (RLS,
missing migration, or missing env var) — check the matching row above.

---

## Notes

- The Supabase project stays **100% in your account**. The app only ever
  uses the publishable/anon key; the `service_role` key lives only in
  Supabase secrets for the two edge functions.
- Tenant Aadhaar is masked in the UI and stored in private buckets —
  never in listings, messages, or exports.
- Money math is paise-safe (`src/lib/billing.ts`); allocation order is
  previous due → rent → current → maintenance → bore → cleaning → other.
