# RentTrack

**Track Every Property. Manage Every Rent.**

A property & rental management SaaS platform with owner and tenant portals:
properties → floors → flats → tenancies → tenants, monthly billing with
payment allocation, advance deposits, meters, expenses, maintenance, a flat
marketplace, reports & analytics, WhatsApp notifications, rent receipts,
late fees, agreement generation, tenant self-onboarding, UPI autopay
architecture, payment reconciliation, rental scores, shared meter splitting,
and PG/co-living mode.

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS + shadcn/ui-style components + Lucide icons
- React Router, TanStack Query, React Hook Form, Zod, Recharts, date-fns, jsPDF, xlsx
- Supabase (Postgres, Auth, Storage, RLS, Edge Functions)

## Getting started

### 1. Prerequisites

- Node.js 20+
- A Supabase project **under your own account** (create it at
  [supabase.com](https://supabase.com); leave the database empty — migrations
  below create everything)

### 2. Install

```bash
npm install
```

### 3. Environment

```bash
cp .env.example .env
```

Fill in the required variables (see table below). Never commit `.env`.
The `service_role` (secret) key is never used by the frontend — only the
publishable/anon key.

| Variable | Where to get it | Required? |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API | Yes |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API (publishable key) | Yes |
| `VITE_WHATSAPP_API_TOKEN` | Meta developer dashboard → WhatsApp Business Cloud API app | No — Settings shows "Not configured" until set |
| `VITE_WHATSAPP_PHONE_NUMBER_ID` | Same as above | No |
| `VITE_PAYMENT_PROVIDER` | `razorpay` or `stripe` | No — tenant portal shows "not connected" until set |
| `VITE_PAYMENT_PUBLIC_KEY` | Provider dashboard (publishable/key id) | No |

Server-side secrets (Supabase secrets or Edge Function env — never `VITE_`):
`WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `PAYMENT_WEBHOOK_SECRET`,
`PAYMENT_KEY_SECRET`. See `supabase/functions/*/README.md`.

### 4. Database

Apply the migrations in `supabase/migrations/` **in filename order**
(001 → 009), using the Supabase SQL editor (paste each file, run) or the
Supabase CLI:

```bash
# with the Supabase CLI linked to your project
supabase db push
```

| # | File | Contents |
|---|---|---|
| 001 | `20261007000001_core_schema.sql` | Core tables (properties, floors, flats, tenants, tenancies, billing, payments, meters, …) |
| 002 | `20261007000002_rls_policies.sql` | Row Level Security policies (owner / tenant / shared roles) |
| 003 | `20261007000003_storage.sql` | Private storage buckets + policies |
| 004 | `20261007000004_auth_trigger.sql` | Auto-create profile + default notifications on signup |
| 005 | `20261007000005_tenant_portal.sql` | Tenant read policies + `link_tenant_login()` |
| 006 | `20261007000006_maintenance_extras.sql` | Maintenance request photos/history, agreement expiry alerts |
| 007 | `20261007000007_marketplace.sql` | Property invitations + marketplace listing policies |
| 008 | `20261007000008_added_features_a.sql` | Receipt paths, notification channels, late-fee config, onboarding tokens |
| 009 | `20261007000009_added_features_b.sql` | UPI mandates, PG mode (`is_pg`, `bed_count`), meter splits |

See `supabase/README.md` for details.

### 5. Run

```bash
npm run dev
```

### 6. Build & deploy (Vercel)

```bash
npm run build
```

Push to GitHub, import the repo in Vercel (framework preset: **Vite**,
build command `npm run build`, output directory `dist`), and set the
environment variables from the table above in the Vercel dashboard.
Full walkthrough: [`DEPLOYMENT.md`](./DEPLOYMENT.md).

## Project structure

```
src/
  components/
    ui/            # shadcn-style primitives (button, card, badge, input…)
    layout/        # AppShell (owner sidebar + header), TenantShell (mobile nav)
    billing/      # Bill detail, record-payment dialog, payments tab
    tenants/      # Add-tenant flow, onboarding link dialog
    agreements/   # Agreement dialog + PDF generator button
    search/       # Global search
  pages/          # Route pages: dashboard, properties, flats, tenants, due,
                  # payments, reports, expenses, maintenance, agreements,
                  # listings, visits, settings, available-flats, notifications…
  pages/portal/   # Tenant portal pages (dashboard, bills, autopay, find-a-flat…)
  lib/
    supabase.ts   # Supabase client (env-driven, never hard-coded)
    billing.ts    # Paise-safe bill math + payment allocation order
    receipts.ts   # Rent receipt PDF generation
    whatsapp.ts   # WhatsApp Cloud API client + templates
    reconcile.ts  # Statement import + auto-match engine
    rentalScore.ts # Tenant payment-behavior score
    exports.ts    # Excel / PDF / print report exports
  hooks/          # TanStack Query data hooks (properties, billing, tenants…)
supabase/
  migrations/     # Versioned SQL: 001 core → 009 added features B
  functions/      # send-reminders (WhatsApp cron), payment-webhook
```

## Key business rules (enforced in the schema)

- **Tenancy is the link** between a tenant and a flat. Tenants are never
  duplicated — moving flats creates a new tenancy. At most one ACTIVE tenancy
  per flat (partial unique index).
- **Monthly bill** = previous due + rent + maintenance + current + bore +
  cleaning + other charges (+ late fee when configured). Previous due is never
  double counted.
- **Payment allocation order**: previous due → rent → current → maintenance →
  bore → cleaning → other.
- **Advance/deposit is separate** from monthly rent.
- **History is never purged** — statuses and end dates are used instead of
  deletion. `effective_date` is distinct from `created_at`.
- **Aadhaar is masked** in the UI and excluded from listings, SMS/WhatsApp,
  and normal reports; documents live in private buckets only.
