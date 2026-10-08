/**
 * Tenant self-onboarding (added feature).
 *
 * The owner generates a single-use, expiring token link for an AVAILABLE flat.
 * The tenant opens it without logging in, fills their details, uploads
 * Aadhaar, and submits. Everything sensitive runs through SECURITY DEFINER
 * RPCs — anonymous users get no direct table access.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { addDays } from "date-fns"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth"

export interface OnboardingToken {
  id: string
  token: string
  property_id: string
  flat_id: string | null
  expires_at: string
  used_at: string | null
  used_tenant_id: string | null
  created_at: string
}

export interface ValidatedToken {
  valid: boolean
  reason?: string
  property_id?: string
  flat_id?: string
  property_name?: string
  flat_number?: string
  expires_at?: string
}

/** Live (unused, unexpired) tokens for a flat. */
export function useOnboardingTokens(flatId: string | undefined) {
  return useQuery({
    queryKey: ["onboarding-tokens", flatId],
    enabled: Boolean(flatId),
    queryFn: async (): Promise<OnboardingToken[]> => {
      const { data, error } = await supabase
        .from("onboarding_tokens")
        .select("*")
        .eq("flat_id", flatId!)
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
      if (error) throw new Error(error.message)
      return data as OnboardingToken[]
    },
  })
}

function randomToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

/** Owner: create a single-use onboarding link for a flat. */
export function useCreateOnboardingToken() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (input: {
      propertyId: string
      flatId: string
      daysValid: number
    }): Promise<OnboardingToken> => {
      const { data, error } = await supabase
        .from("onboarding_tokens")
        .insert({
          token: randomToken(),
          property_id: input.propertyId,
          flat_id: input.flatId,
          expires_at: addDays(new Date(), input.daysValid).toISOString(),
          created_by: user?.id ?? null,
        })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data as OnboardingToken
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["onboarding-tokens", vars.flatId] })
    },
  })
}

/** Owner: revoke (delete) an unused token. */
export function useRevokeOnboardingToken() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; flatId: string }) => {
      const { error } = await supabase
        .from("onboarding_tokens")
        .delete()
        .eq("id", input.id)
        .is("used_at", null)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["onboarding-tokens", vars.flatId] })
    },
  })
}

/** Public: validate a token (anonymous-safe RPC). */
export async function validateOnboardingToken(token: string): Promise<ValidatedToken> {
  const { data, error } = await supabase.rpc("validate_onboarding_token", {
    p_token: token,
  })
  if (error) throw new Error(error.message)
  return data as ValidatedToken
}

export interface OnboardingTenantInput {
  full_name: string
  primary_phone: string
  address: string
  occupation: string
  place_of_work: string
  notes: string
}

export interface OnboardingFamilyInput {
  name: string
  relationship: string
  dob: string
  age: string
  occupation: string
  phone: string
  aadhaar_number: string
  notes: string
}

/**
 * Public: submit the onboarding form. Uploads must already be in
 * `aadhaar-documents/onboarding/<token>/…` (anonymous upload policy checks
 * the token is live). Returns the new tenant id.
 */
export async function completeOnboarding(input: {
  token: string
  tenant: OnboardingTenantInput
  family: OnboardingFamilyInput[]
  aadhaarFrontPath: string | null
  aadhaarBackPath: string | null
}): Promise<string> {
  const { data, error } = await supabase.rpc("complete_onboarding", {
    p_token: input.token,
    p_tenant: {
      full_name: input.tenant.full_name,
      primary_phone: input.tenant.primary_phone || null,
      address: input.tenant.address || null,
      occupation: input.tenant.occupation || null,
      place_of_work: input.tenant.place_of_work || null,
      notes: input.tenant.notes || null,
    },
    p_family: input.family
      .filter((f) => f.name.trim() !== "")
      .map((f) => ({
        name: f.name,
        relationship: f.relationship || null,
        dob: f.dob || null,
        age: f.age || null,
        occupation: f.occupation || null,
        phone: f.phone || null,
        aadhaar_number: f.aadhaar_number || null,
        notes: f.notes || null,
      })),
    p_aadhaar_front_path: input.aadhaarFrontPath,
    p_aadhaar_back_path: input.aadhaarBackPath,
  })
  if (error) throw new Error(error.message)
  return data as string
}

/** Public: upload an Aadhaar image into the token-scoped onboarding folder. */
export async function uploadOnboardingAadhaar(
  token: string,
  side: "front" | "back",
  file: File
): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg"
  const path = `onboarding/${token}/${side}-${Date.now()}.${ext}`
  const { error } = await supabase.storage
    .from("aadhaar-documents")
    .upload(path, file, { contentType: file.type || "image/jpeg" })
  if (error) throw new Error(error.message)
  return path
}

/** Public share URL for an onboarding link. */
export function onboardingLink(token: string): string {
  return `${window.location.origin}/onboard/${token}`
}
