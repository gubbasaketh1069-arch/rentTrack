import { createClient } from "@supabase/supabase-js"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    "[RentTrack] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. " +
      "Copy .env.example to .env and fill in your Supabase project credentials."
  )
}

/**
 * Shared Supabase client. Uses the anon key only — all authorization is
 * enforced by Postgres Row Level Security, never by the frontend.
 */
export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "")
