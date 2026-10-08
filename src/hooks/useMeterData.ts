import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"

// ---------------------------------------------------------------------------
// Types (mirror supabase/migrations/20261007000001_core_schema.sql)
// ---------------------------------------------------------------------------

export type MeterType = "ELECTRICITY" | "BORE"

export interface Meter {
  id: string
  flat_id: string
  property_id: string | null
  type: MeterType
  meter_number: string | null
  usc: string | null
  serial_number: string | null
  start_date: string | null
  end_date: string | null
  is_current: boolean
  /** A shared meter serves several flats; its bill is split via meter_splits. */
  is_shared: boolean
  created_at: string
  updated_at: string
}

export interface MeterReading {
  id: string
  meter_id: string
  previous_reading: number | string | null
  current_reading: number | string | null
  units_used: number | string | null // generated column: current - previous
  reading_date: string
  created_at: string
}

export type MeterInput = {
  flat_id: string
  property_id: string | null
  type: MeterType
  meter_number: string | null
  usc: string | null
  serial_number: string | null
  start_date: string | null
}

function invalidateMeters(qc: ReturnType<typeof useQueryClient>, flatId?: string) {
  qc.invalidateQueries({ queryKey: ["meters", flatId] })
  qc.invalidateQueries({ queryKey: ["meters"] })
  qc.invalidateQueries({ queryKey: ["meter-readings"] })
}

export function useMeters(flatId: string | undefined) {
  return useQuery({
    queryKey: ["meters", flatId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meters")
        .select("*")
        .eq("flat_id", flatId!)
        .order("is_current", { ascending: false })
        .order("start_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
      if (error) throw new Error(error.message)
      return data as Meter[]
    },
    enabled: !!flatId,
  })
}

export function useCreateMeter(flatId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: MeterInput) => {
      // Only one current meter per type per flat: retire any existing one.
      const { data: existing, error: readError } = await supabase
        .from("meters")
        .select("id")
        .eq("flat_id", input.flat_id)
        .eq("type", input.type)
        .eq("is_current", true)
      if (readError) throw new Error(readError.message)
      if (existing && existing.length > 0) {
        throw new Error(
          `This flat already has a current ${input.type === "ELECTRICITY" ? "electricity" : "bore"} meter. Use "Replace meter" instead.`
        )
      }
      const { error } = await supabase.from("meters").insert({
        flat_id: input.flat_id,
        property_id: input.property_id,
        type: input.type,
        meter_number: input.meter_number,
        usc: input.usc,
        serial_number: input.serial_number,
        start_date: input.start_date,
        is_current: true,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => invalidateMeters(qc, flatId),
  })
}

/**
 * Replace a meter (spec section 28): the old meter stays in history with its
 * end_date set — it is NEVER deleted. The new meter becomes current.
 * Insert-then-retire ordering means a failed insert leaves history untouched.
 */
export function useReplaceMeter(flatId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      oldMeter,
      input,
      endDate,
    }: {
      oldMeter: Meter
      input: MeterInput
      endDate: string
    }) => {
      const { data: inserted, error: insertError } = await supabase
        .from("meters")
        .insert({
          flat_id: input.flat_id,
          property_id: input.property_id,
          type: input.type,
          meter_number: input.meter_number,
          usc: input.usc,
          serial_number: input.serial_number,
          start_date: input.start_date ?? endDate,
          is_current: true,
        })
        .select("id")
        .single()
      if (insertError) throw new Error(insertError.message)
      const { error: retireError } = await supabase
        .from("meters")
        .update({ is_current: false, end_date: endDate })
        .eq("id", oldMeter.id)
      if (retireError) {
        // Roll back the insert so we never end up with two current meters.
        await supabase.from("meters").delete().eq("id", inserted.id)
        throw new Error(retireError.message)
      }
    },
    onSuccess: () => invalidateMeters(qc, flatId),
  })
}

export function useUpdateMeter(flatId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string
      input: Partial<Omit<MeterInput, "flat_id" | "type">> & { end_date?: string | null; is_shared?: boolean }
    }) => {
      const { error } = await supabase.from("meters").update(input).eq("id", id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => invalidateMeters(qc, flatId),
  })
}

/**
 * Delete a meter only when it has no readings — readings are history and
 * must never be destroyed (spec section 28). Replaced meters stay forever.
 */
export function useDeleteMeter(flatId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (meterId: string) => {
      const { count, error: countError } = await supabase
        .from("meter_readings")
        .select("id", { count: "exact", head: true })
        .eq("meter_id", meterId)
      if (countError) throw new Error(countError.message)
      if ((count ?? 0) > 0) {
        throw new Error(
          "This meter has readings recorded against it. Readings are history and can't be deleted — use 'Replace meter' instead."
        )
      }
      const { error } = await supabase.from("meters").delete().eq("id", meterId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => invalidateMeters(qc, flatId),
  })
}

export function useMeterReadings(meterId: string | undefined) {
  return useQuery({
    queryKey: ["meter-readings", meterId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meter_readings")
        .select("*")
        .eq("meter_id", meterId!)
        .order("reading_date", { ascending: false })
        .order("created_at", { ascending: false })
      if (error) throw new Error(error.message)
      return data as MeterReading[]
    },
    enabled: !!meterId,
  })
}

export function useAddReading() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      meterId,
      readingDate,
      currentReading,
    }: {
      meterId: string
      readingDate: string
      currentReading: number
    }) => {
      // Previous reading auto-fills from the latest reading's current value.
      const { data: latest, error: latestError } = await supabase
        .from("meter_readings")
        .select("current_reading")
        .eq("meter_id", meterId)
        .order("reading_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (latestError) throw new Error(latestError.message)
      const previous = latest?.current_reading != null ? Number(latest.current_reading) : 0
      if (currentReading < previous) {
        throw new Error(
          `Current reading (${currentReading}) can't be less than the previous reading (${previous}).`
        )
      }
      const { error } = await supabase.from("meter_readings").insert({
        meter_id: meterId,
        previous_reading: previous,
        current_reading: currentReading,
        reading_date: readingDate,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meter-readings"] })
    },
  })
}

export function useDeleteReading() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (readingId: string) => {
      const { error } = await supabase
        .from("meter_readings")
        .delete()
        .eq("id", readingId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meter-readings"] })
    },
  })
}

// ---------------------------------------------------------------------------
// Shared meter splits (added feature B)
// ---------------------------------------------------------------------------

export interface MeterSplitShare {
  flat_id: string
  tenancy_id: string
  flat_number: string
  tenant_name: string
  share_amount: number
  method: "equal" | "ratio" | "units"
  basis: string
}

export interface MeterSplit {
  id: string
  meter_id: string
  property_id: string
  year: number
  month: number
  total_amount: number | string
  bill_kind: "ELECTRICITY" | "BORE"
  shares: MeterSplitShare[]
  status: "PENDING" | "APPLIED" | "CANCELLED"
  notes: string | null
  created_at: string
}

/** Split history for one meter, newest first. */
export function useMeterSplits(meterId: string | undefined) {
  return useQuery({
    queryKey: ["meter-splits", meterId],
    queryFn: async (): Promise<MeterSplit[]> => {
      const { data, error } = await supabase
        .from("meter_splits")
        .select("*")
        .eq("meter_id", meterId!)
        .order("created_at", { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []) as MeterSplit[]
    },
    enabled: !!meterId,
  })
}

/** PENDING splits targeting one tenancy — suggested when its next monthly record is created. */
export function usePendingSplitsForTenancy(tenancyId: string | undefined) {
  return useQuery({
    queryKey: ["pending-splits", tenancyId],
    queryFn: async (): Promise<MeterSplit[]> => {
      const { data, error } = await supabase
        .from("meter_splits")
        .select("*")
        .eq("status", "PENDING")
      if (error) throw new Error(error.message)
      // shares is a JSON array; filter client-side for this tenancy.
      return ((data ?? []) as MeterSplit[]).filter((s) =>
        (s.shares ?? []).some((sh) => sh.tenancy_id === tenancyId)
      )
    },
    enabled: !!tenancyId,
  })
}

export interface CreateSplitInput {
  meterId: string
  propertyId: string
  year: number
  month: number
  totalAmount: number
  billKind: "ELECTRICITY" | "BORE"
  shares: MeterSplitShare[]
  notes?: string | null
}

export function useCreateMeterSplit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateSplitInput): Promise<MeterSplit> => {
      const { data: user } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from("meter_splits")
        .insert({
          meter_id: input.meterId,
          property_id: input.propertyId,
          year: input.year,
          month: input.month,
          total_amount: input.totalAmount,
          bill_kind: input.billKind,
          shares: input.shares,
          status: "PENDING",
          notes: input.notes?.trim() ? input.notes.trim() : null,
          created_by: user?.user?.id ?? null,
        })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data as MeterSplit
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["meter-splits", d.meter_id] })
      qc.invalidateQueries({ queryKey: ["pending-splits"] })
    },
  })
}

/** Mark a split APPLIED (after its shares landed on monthly records) or CANCELLED. */
export function useSetSplitStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ split, status }: { split: MeterSplit; status: "APPLIED" | "CANCELLED" }) => {
      if (split.status !== "PENDING") throw new Error("Only pending splits can be updated.")
      const { error } = await supabase
        .from("meter_splits")
        .update({ status })
        .eq("id", split.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["meter-splits", vars.split.meter_id] })
      qc.invalidateQueries({ queryKey: ["pending-splits"] })
    },
  })
}
