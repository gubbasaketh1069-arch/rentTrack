# Supabase — RentTrack

## Migrations

Apply in filename order:

1. `20261007000001_core_schema.sql` — all tables, constraints, indexes,
   `updated_at` triggers.
2. `20261007000002_rls_policies.sql` — Row Level Security on every table.
3. `20261007000003_storage.sql` — storage buckets + bucket policies.

### Via Supabase SQL editor

Paste each file's contents into the SQL editor and run, in order.

### Via Supabase CLI

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

## Notes

- The spec says "28 core tables" but lists 32 names; all 32 listed names are
  created — names are authoritative, the count was a spec typo.
- `activity_logs` carries a nullable `property_id` so property-scoped RLS is
  possible.
- No seed data is included. Aadhaar columns exist but are never populated by
  migrations.
- `notification_logs` has no anon insert/update/delete policies — delivery
  logging is service-role (Edge Function) only.
