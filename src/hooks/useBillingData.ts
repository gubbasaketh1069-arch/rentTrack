import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import {
  allocatePayment,
  billStatus,
  compareMonth,
  computeRemainingDue,
  computeTotalPayable,
  deriveAdvanceStatus,
  monthLabel,
  toPaise,
  toRupees,
  unpaidBuckets,
  type AdvanceStatus,
  type AllocationCategory,
} from "@/lib/billing"
import { generateReceiptPdf, uploadReceiptPdf } from "@/lib/receipts"
import {
  isWhatsAppConfigured,
  paymentConfirmationMessage,
  rentReminderMessage,
} from "@/lib/whatsapp"

// ---------------------------------------------------------------------------
// Types (mirror supabase/migrations/20261007000001_core_schema.sql)
// ---------------------------------------------------------------------------

export interface RentHistoryRow {
  id: string
  tenancy_id: string | null
  flat_id: string | null
  old_rent: number | string | null
  new_rent: number | string
  effective_date: string
  reason: string | null
  notes: string | null
  changed_by: string | null
  created_at: string
}

export interface MonthlyRecord {
  id: string
  tenancy_id: string
  property_id: string
  flat_id: string | null
  month: number
  year: number
  applicable_rent: number | string
  maintenance: number | string
  current_bill: number | string
  bore_bill: number | string
  cleaning: number | string
  other_charges: number | string
  previous_due: number | string
  late_fee: number | string
  total_payable: number | string
  total_paid: number | string
  remaining_due: number | string
  status: "PAID" | "PARTIAL" | "LATE_DUE" | "DUE"
  notes: string | null
  created_at: string
  updated_at: string
}

export interface PaymentAllocation {
  id: string
  payment_id: string
  category: AllocationCategory
  amount: number | string
  created_at: string
}

export interface Payment {
  id: string
  tenant_id: string | null
  property_id: string | null
  flat_id: string | null
  tenancy_id: string | null
  monthly_record_id: string | null
  amount: number | string
  method: "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | "OTHER"
  payment_date: string
  transaction_id: string | null
  status: "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED"
  notes: string | null
  recorded_by: string | null
  /** Private storage path of the auto-generated receipt PDF (payment-receipts bucket). */
  receipt_path: string | null
  created_at: string
  allocations?: PaymentAllocation[]
}

export interface AdvanceDeposit {
  id: string
  tenancy_id: string
  agreed_amount: number | string
  amount_received: number | string
  received_date: string | null
  method: string | null
  refunded_amount: number | string
  refund_date: string | null
  adjusted_amount: number | string
  status: AdvanceStatus
  notes: string | null
  created_at: string
  updated_at: string
}

function invalidateBilling(
  qc: ReturnType<typeof useQueryClient>,
  tenantId?: string,
  propertyId?: string
) {
  qc.invalidateQueries({ queryKey: ["monthly-records"] })
  qc.invalidateQueries({ queryKey: ["monthly-record"] })
  qc.invalidateQueries({ queryKey: ["record-payments"] })
  qc.invalidateQueries({ queryKey: ["payments"] })
  qc.invalidateQueries({ queryKey: ["rent-history"] })
  qc.invalidateQueries({ queryKey: ["advance-deposits"] })
  qc.invalidateQueries({ queryKey: ["due-list"] })
  if (tenantId) {
    qc.invalidateQueries({ queryKey: ["tenant", tenantId] })
    qc.invalidateQueries({ queryKey: ["tenant-tenancies", tenantId] })
  }
  if (propertyId) {
    qc.invalidateQueries({ queryKey: ["outstanding-due", propertyId] })
    qc.invalidateQueries({ queryKey: ["property", propertyId] })
  }
  qc.invalidateQueries({ queryKey: ["portfolio-stats"] })
}

// ---------------------------------------------------------------------------
// Rent history (spec sections 14-15)
// ---------------------------------------------------------------------------

/** Every rent change for a tenancy, newest effective date first. Immutable. */
export function useRentHistory(tenancyId: string | undefined) {
  return useQuery({
    queryKey: ["rent-history", tenancyId],
    queryFn: async (): Promise<RentHistoryRow[]> => {
      const { data, error } = await supabase
        .from("rent_history")
        .select("*")
        .eq("tenancy_id", tenancyId!)
        .order("effective_date", { ascending: false })
        .order("created_at", { ascending: false })
      if (error) throw new Error(error.message)
      return data as RentHistoryRow[]
    },
    enabled: !!tenancyId,
  })
}

export interface ChangeRentInput {
  tenancyId: string
  flatId: string | null
  oldRent: number | null
  newRent: number
  effectiveDate: string
  reason?: string | null
  notes?: string | null
}

/**
 * Record a rent change. Inserts a rent_history row only — past
 * monthly_records are never modified (spec section 14).
 */
export function useChangeRent() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (input: ChangeRentInput) => {
      const { error } = await supabase.from("rent_history").insert({
        tenancy_id: input.tenancyId,
        flat_id: input.flatId,
        old_rent: input.oldRent,
        new_rent: input.newRent,
        effective_date: input.effectiveDate,
        reason: input.reason?.trim() ? input.reason.trim() : null,
        notes: input.notes?.trim() ? input.notes.trim() : null,
        changed_by: user?.id ?? null,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["rent-history", vars.tenancyId] })
      void logActivity({
        action: "rent_changed",
        entity: "tenancy",
        entityId: vars.tenancyId,
        newValue: { new_rent: vars.newRent, effective_date: vars.effectiveDate, reason: vars.reason ?? null },
      })
    },
  })
}

// ---------------------------------------------------------------------------
// Monthly billing (spec sections 16-17, 29-31)
// ---------------------------------------------------------------------------

/** All monthly records of a tenancy, newest first. */
export function useMonthlyRecords(tenancyId: string | undefined) {
  return useQuery({
    queryKey: ["monthly-records", tenancyId],
    queryFn: async (): Promise<MonthlyRecord[]> => {
      const { data, error } = await supabase
        .from("monthly_records")
        .select("*")
        .eq("tenancy_id", tenancyId!)
        .order("year", { ascending: false })
        .order("month", { ascending: false })
      if (error) throw new Error(error.message)
      return data as MonthlyRecord[]
    },
    enabled: !!tenancyId,
  })
}

export interface CreateMonthlyRecordInput {
  tenancyId: string
  propertyId: string
  flatId: string | null
  year: number
  month: number
  rent: number
  maintenance: number
  currentBill: number
  boreBill: number
  cleaning: number
  otherCharges: number
  /** Pre-computed by the dialog from the property's late-fee config. */
  lateFee?: number
  notes?: string | null
}

/**
 * Create one monthly billing record.
 *
 * Previous due is carried from the latest earlier record's remaining_due
 * for the same tenancy (stored on the new row — never recomputed live, so
 * it can never be double counted). total_payable follows the spec formula.
 */
export function useCreateMonthlyRecord() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateMonthlyRecordInput): Promise<MonthlyRecord> => {
      // Latest record strictly before (year, month) for this tenancy.
      const { data: prior, error: priorErr } = await supabase
        .from("monthly_records")
        .select("year, month, remaining_due")
        .eq("tenancy_id", input.tenancyId)
        .order("year", { ascending: false })
        .order("month", { ascending: false })
      if (priorErr) throw new Error(priorErr.message)
      const prev = (prior ?? []).find(
        (r) => compareMonth({ year: r.year, month: r.month }, { year: input.year, month: input.month }) < 0
      )
      const previousDue = prev ? Number(prev.remaining_due) : 0
      const lateFee = input.lateFee ?? 0

      const totalPayable = computeTotalPayable({
        previous_due: previousDue,
        rent: input.rent,
        maintenance: input.maintenance,
        current_bill: input.currentBill,
        bore_bill: input.boreBill,
        cleaning: input.cleaning,
        other_charges: input.otherCharges,
        late_fee: lateFee,
      })

      const { data, error } = await supabase
        .from("monthly_records")
        .insert({
          tenancy_id: input.tenancyId,
          property_id: input.propertyId,
          flat_id: input.flatId,
          year: input.year,
          month: input.month,
          applicable_rent: input.rent,
          maintenance: input.maintenance,
          current_bill: input.currentBill,
          bore_bill: input.boreBill,
          cleaning: input.cleaning,
          other_charges: input.otherCharges,
          late_fee: lateFee,
          previous_due: previousDue,
          total_payable: totalPayable,
          total_paid: 0,
          remaining_due: totalPayable,
          status: totalPayable > 0 ? "DUE" : "PAID",
          notes: input.notes?.trim() ? input.notes.trim() : null,
        })
        .select()
        .single()
      if (error) {
        if (error.code === "23505") {
          throw new Error(
            "A billing record already exists for this month. Edit is not supported — records are immutable once created."
          )
        }
        throw new Error(error.message)
      }
      return data as MonthlyRecord
    },
    onSuccess: (_d, vars) => {
      invalidateBilling(qc, undefined, vars.propertyId)
      qc.invalidateQueries({ queryKey: ["monthly-records", vars.tenancyId] })
    },
  })
}

// ---------------------------------------------------------------------------
// Payments + allocation (spec sections 18-22)
// ---------------------------------------------------------------------------

/** Every payment of a tenancy with its allocation breakdown, newest first. */
export function usePayments(tenancyId: string | undefined) {
  return useQuery({
    queryKey: ["payments", tenancyId],
    queryFn: async (): Promise<Payment[]> => {
      const { data, error } = await supabase
        .from("payments")
        .select("*, payment_allocations(*)")
        .eq("tenancy_id", tenancyId!)
        .order("payment_date", { ascending: false })
        .order("created_at", { ascending: false })
      if (error) throw new Error(error.message)
      return (data as Array<Payment & { payment_allocations: PaymentAllocation[] }>).map(
        (p) => ({ ...p, allocations: p.payment_allocations ?? [] })
      )
    },
    enabled: !!tenancyId,
  })
}

/** Payments against one monthly record, with allocations (bill detail view). */
export function useMonthlyRecordPayments(monthlyRecordId: string | undefined) {
  return useQuery({
    queryKey: ["record-payments", monthlyRecordId],
    queryFn: async (): Promise<Payment[]> => {
      const { data, error } = await supabase
        .from("payments")
        .select("*, payment_allocations(*)")
        .eq("monthly_record_id", monthlyRecordId!)
        .order("payment_date", { ascending: false })
        .order("created_at", { ascending: false })
      if (error) throw new Error(error.message)
      return (data as Array<Payment & { payment_allocations: PaymentAllocation[] }>).map(
        (p) => ({ ...p, allocations: p.payment_allocations ?? [] })
      )
    },
    enabled: !!monthlyRecordId,
  })
}

export interface RecordPaymentInput {
  tenantId: string
  propertyId: string
  flatId: string | null
  tenancyId: string
  monthlyRecordId: string
  amount: number
  method: Payment["method"]
  paymentDate: string
  transactionId?: string | null
  notes?: string | null
}

export interface RecordPaymentResult {
  payment: Payment
  allocations: Array<{ category: AllocationCategory; amount: number }>
  newTotalPaid: number
  newRemainingDue: number
  newStatus: MonthlyRecord["status"]
  /** Storage path of the auto-generated receipt PDF, or null if generation failed. */
  receiptPath: string | null
}

/**
 * Record a payment (full, partial, or one of many).
 *
 * 1. Inserts ONE payments row (insert-only, never overwritten).
 * 2. Auto-allocates the amount across the record's unpaid buckets in strict
 *    spec order (PREVIOUS_DUE first) and inserts N payment_allocations rows.
 * 3. Rolls total_paid / remaining_due / status up onto the monthly record.
 *
 * Allocation math is paise-safe (see src/lib/billing.ts).
 */
export function useRecordPayment() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (input: RecordPaymentInput): Promise<RecordPaymentResult> => {
      const amount = toRupees(toPaise(input.amount))
      if (!(amount > 0)) throw new Error("Amount must be greater than zero.")

      // Fresh record + everything already allocated against it.
      const { data: record, error: recErr } = await supabase
        .from("monthly_records")
        .select("*")
        .eq("id", input.monthlyRecordId)
        .single()
      if (recErr) throw new Error(recErr.message)
      const mr = record as MonthlyRecord

      const { data: priorPayments, error: payErr } = await supabase
        .from("payments")
        .select("id, payment_allocations(category, amount)")
        .eq("monthly_record_id", input.monthlyRecordId)
        .eq("status", "SUCCESS")
      if (payErr) throw new Error(payErr.message)

      const allocatedSums: Partial<Record<AllocationCategory, number>> = {}
      for (const p of priorPayments ?? []) {
        for (const a of (p as unknown as { payment_allocations: Array<{ category: AllocationCategory; amount: number | string }> }).payment_allocations ?? []) {
          allocatedSums[a.category] = toRupees(
            toPaise(allocatedSums[a.category] ?? 0) + toPaise(a.amount)
          )
        }
      }

      const unpaid = unpaidBuckets(mr, allocatedSums)
      const allocations = allocatePayment(amount, unpaid)
      const hasExcess = allocations.some((a) => a.excess)

      const notesParts: string[] = []
      if (input.notes?.trim()) notesParts.push(input.notes.trim())
      if (hasExcess) {
        const excessTotal = allocations
          .filter((a) => a.excess)
          .reduce((s, a) => s + toPaise(a.amount), 0)
        notesParts.push(
          `Excess of ${toRupees(excessTotal).toFixed(2)} beyond this month's unpaid charges was recorded under Other Charges.`
        )
      }

      const { data: payment, error: insErr } = await supabase
        .from("payments")
        .insert({
          tenant_id: input.tenantId,
          property_id: input.propertyId,
          flat_id: input.flatId,
          tenancy_id: input.tenancyId,
          monthly_record_id: input.monthlyRecordId,
          amount,
          method: input.method,
          payment_date: input.paymentDate,
          transaction_id: input.transactionId?.trim() ? input.transactionId.trim() : null,
          status: "SUCCESS",
          notes: notesParts.length > 0 ? notesParts.join(" ") : null,
          recorded_by: user?.id ?? null,
        })
        .select()
        .single()
      if (insErr) throw new Error(insErr.message)

      const { error: allocErr } = await supabase.from("payment_allocations").insert(
        allocations.map((a) => ({
          payment_id: (payment as Payment).id,
          category: a.category,
          amount: a.amount,
        }))
      )
      if (allocErr) throw new Error(allocErr.message)

      const newTotalPaid = toRupees(toPaise(mr.total_paid) + toPaise(amount))
      const newRemainingDue = computeRemainingDue(Number(mr.total_payable), newTotalPaid)
      const newStatus = billStatus(Number(mr.total_payable), newTotalPaid)

      const { error: updErr } = await supabase
        .from("monthly_records")
        .update({
          total_paid: newTotalPaid,
          remaining_due: newRemainingDue,
          status: newStatus,
        })
        .eq("id", input.monthlyRecordId)
      if (updErr) throw new Error(updErr.message)

      // Auto-generate the receipt PDF (added feature). Receipt failure must
      // never fail the payment itself — it is recorded honestly as missing.
      let receiptPath: string | null = null
      try {
        const [{ data: tenantRow }, { data: propertyRow }, { data: flatRow }] =
          await Promise.all([
            supabase.from("tenants").select("full_name").eq("id", input.tenantId).single(),
            supabase.from("properties").select("name").eq("id", input.propertyId).single(),
            input.flatId
              ? supabase.from("flats").select("flat_number").eq("id", input.flatId).single()
              : Promise.resolve({ data: null }),
          ])
        const pdf = generateReceiptPdf({
          tenantName: (tenantRow as { full_name: string } | null)?.full_name ?? "—",
          propertyName: (propertyRow as { name: string } | null)?.name ?? "—",
          flatNumber: (flatRow as { flat_number: string } | null)?.flat_number ?? "—",
          monthLabel: monthLabel(mr.year, mr.month),
          amount,
          method: input.method,
          transactionId: (payment as Payment).transaction_id ?? null,
          paymentDate: input.paymentDate,
          totalPayable: Number(mr.total_payable),
          totalPaid: newTotalPaid,
          remainingDue: newRemainingDue,
          status: newStatus,
        })
        receiptPath = await uploadReceiptPdf(pdf, input.propertyId, (payment as Payment).id)
        await supabase
          .from("payments")
          .update({ receipt_path: receiptPath })
          .eq("id", (payment as Payment).id)
      } catch (receiptErr) {
        console.warn("Receipt PDF generation failed (payment itself succeeded):", receiptErr)
      }

      return {
        payment: payment as Payment,
        allocations: allocations.map((a) => ({ category: a.category, amount: a.amount })),
        newTotalPaid,
        newRemainingDue,
        newStatus,
        receiptPath,
      }
    },
    onSuccess: (data, vars) => {
      invalidateBilling(qc, vars.tenantId, vars.propertyId)
      qc.invalidateQueries({ queryKey: ["monthly-records", vars.tenancyId] })
      qc.invalidateQueries({ queryKey: ["payments", vars.tenancyId] })
      void logActivity({
        action: "payment_recorded",
        entity: "payment",
        entityId: data.payment?.id,
        propertyId: vars.propertyId,
        newValue: { amount: data.payment?.amount, method: data.payment?.method, month_record: vars.monthlyRecordId },
      })
      // Queue a WhatsApp payment confirmation (added feature). The row is
      // always written; the Edge Function sends it when WhatsApp is configured.
      void (async () => {
        try {
          if (!isWhatsAppConfigured()) return
          const [{ data: tenantRow }, { data: propertyRow }, { data: flatRow }] = await Promise.all([
            supabase.from("tenants").select("full_name, primary_phone").eq("id", vars.tenantId).single(),
            supabase.from("properties").select("name").eq("id", vars.propertyId).single(),
            vars.flatId
              ? supabase.from("flats").select("flat_number").eq("id", vars.flatId).single()
              : Promise.resolve({ data: null }),
          ])
          const phone = (tenantRow as { primary_phone: string } | null)?.primary_phone
          if (!phone) return
          const body = paymentConfirmationMessage({
            tenantName: (tenantRow as { full_name: string } | null)?.full_name ?? "Tenant",
            amount: Number(data.payment?.amount ?? 0).toFixed(2),
            propertyName: (propertyRow as { name: string } | null)?.name ?? "",
            flatNumber: (flatRow as { flat_number: string } | null)?.flat_number ?? "",
            method: (data.payment?.method ?? "").replace("_", " "),
            remainingDue: data.newRemainingDue.toFixed(2),
            status: data.newStatus.replace("_", " "),
          })
          await supabase.from("notifications").insert({
            user_id: user?.id ?? null,
            title: "Payment confirmation (WhatsApp)",
            body,
            type: "payment_confirmation",
            related_entity: "payment",
            related_id: data.payment?.id,
            channel: "whatsapp",
            status: "pending",
          })
        } catch (err) {
          console.warn("Could not queue WhatsApp confirmation:", err)
        }
      })()
    },
  })
}

// ---------------------------------------------------------------------------
// Advance / security deposit (spec sections 23-24)
// ---------------------------------------------------------------------------

/** All advance/deposit records of a tenancy, newest first. */
export function useAdvanceDeposits(tenancyId: string | undefined) {
  return useQuery({
    queryKey: ["advance-deposits", tenancyId],
    queryFn: async (): Promise<AdvanceDeposit[]> => {
      const { data, error } = await supabase
        .from("advance_deposits")
        .select("*")
        .eq("tenancy_id", tenancyId!)
        .order("created_at", { ascending: false })
      if (error) throw new Error(error.message)
      return data as AdvanceDeposit[]
    },
    enabled: !!tenancyId,
  })
}

export interface SaveAdvanceInput {
  tenancyId: string
  id?: string
  agreedAmount: number
  amountReceived: number
  receivedDate?: string | null
  method?: string | null
  refundedAmount: number
  refundDate?: string | null
  adjustedAmount: number
  notes?: string | null
}

/**
 * Record or update an advance/deposit. Status is derived deterministically
 * from the amounts (see deriveAdvanceStatus). Advance is never added to any
 * monthly payable — it lives entirely in this table.
 */
export function useSaveAdvance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: SaveAdvanceInput) => {
      const status = deriveAdvanceStatus({
        agreed: input.agreedAmount,
        received: input.amountReceived,
        refunded: input.refundedAmount,
        adjusted: input.adjustedAmount,
      })
      const row = {
        tenancy_id: input.tenancyId,
        agreed_amount: toRupees(toPaise(input.agreedAmount)),
        amount_received: toRupees(toPaise(input.amountReceived)),
        received_date: input.receivedDate || null,
        method: input.method?.trim() ? input.method.trim() : null,
        refunded_amount: toRupees(toPaise(input.refundedAmount)),
        refund_date: input.refundDate || null,
        adjusted_amount: toRupees(toPaise(input.adjustedAmount)),
        status,
        notes: input.notes?.trim() ? input.notes.trim() : null,
      }
      if (input.id) {
        const { error } = await supabase
          .from("advance_deposits")
          .update(row)
          .eq("id", input.id)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase.from("advance_deposits").insert(row)
        if (error) throw new Error(error.message)
      }
      return status
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["advance-deposits", vars.tenancyId] })
    },
  })
}

// ---------------------------------------------------------------------------
// Owner due list (spec: all tenancies with remaining due)
// ---------------------------------------------------------------------------

export interface DueRow {
  tenancyId: string
  tenantId: string
  tenantName: string
  propertyId: string
  propertyName: string
  flatId: string | null
  flatNumber: string | null
  year: number
  month: number
  totalPayable: number
  totalPaid: number
  remainingDue: number
  status: MonthlyRecord["status"]
  monthlyRecordId: string
}

/**
 * Every ACTIVE tenancy with a remaining due, using only its LATEST monthly
 * record (older balances are already carried into it as previous_due, so
 * listing every month would double count). Sorted by amount, largest first.
 */
export function useDueList() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["due-list", user?.id],
    queryFn: async (): Promise<{ rows: DueRow[]; total: number }> => {
      const { data, error } = await supabase
        .from("monthly_records")
        .select(
          "id, tenancy_id, year, month, total_payable, total_paid, remaining_due, status," +
            " tenancy:tenancies!inner(id, status, tenant:tenants!inner(id, full_name)," +
            " property:properties!inner(id, name), flat:flats(id, flat_number))"
        )
        .gt("remaining_due", 0)
        .eq("tenancy.status", "ACTIVE")
        .order("remaining_due", { ascending: false })
        .limit(500)
      if (error) throw new Error(error.message)

      interface RawTenancy {
        tenant: { id: string; full_name: string } | Array<{ id: string; full_name: string }>
        property: { id: string; name: string } | Array<{ id: string; name: string }>
        flat: { id: string; flat_number: string } | Array<{ id: string; flat_number: string }> | null
      }
      interface Raw {
        id: string
        tenancy_id: string
        year: number
        month: number
        total_payable: number | string
        total_paid: number | string
        remaining_due: number | string
        status: MonthlyRecord["status"]
        tenancy: RawTenancy | RawTenancy[]
      }
      const one = <T,>(v: T | T[] | null | undefined): T | null =>
        Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

      // Keep only the latest month per tenancy to avoid double counting.
      const latest = new Map<string, Raw>()
      for (const r of ((data ?? []) as unknown as Raw[])) {
        const cur = latest.get(r.tenancy_id)
        if (
          !cur ||
          compareMonth({ year: r.year, month: r.month }, { year: cur.year, month: cur.month }) > 0
        ) {
          latest.set(r.tenancy_id, r)
        }
      }

      const rows: DueRow[] = [...latest.values()].map((r) => {
        const tenancy = one(r.tenancy) as RawTenancy
        const tenant = one(tenancy.tenant)!
        const property = one(tenancy.property)!
        const flat = one(tenancy.flat)
        return {
          tenancyId: r.tenancy_id,
          tenantId: tenant.id,
          tenantName: tenant.full_name,
          propertyId: property.id,
          propertyName: property.name,
          flatId: flat?.id ?? null,
          flatNumber: flat?.flat_number ?? null,
          year: r.year,
          month: r.month,
          totalPayable: Number(r.total_payable),
          totalPaid: Number(r.total_paid),
          remainingDue: Number(r.remaining_due),
          status: r.status,
          monthlyRecordId: r.id,
        }
      })
      rows.sort((a, b) => b.remainingDue - a.remainingDue)
      const total = rows.reduce((s, r) => s + r.remainingDue, 0)
      return { rows, total }
    },
    enabled: !!user,
  })
}

// ---------------------------------------------------------------------------
// Rent reminders (added feature: WhatsApp channel)
// ---------------------------------------------------------------------------

export interface DueRowInput {
  tenancyId: string
  tenantName: string
  propertyName: string
  flatNumber: string | null
  year: number
  month: number
  remainingDue: number
  monthlyRecordId: string
}

/**
 * Queue rent reminders for overdue bills. Writes notification rows —
 * channel=whatsapp/status=pending when WhatsApp is configured (the
 * send-reminders Edge Function delivers them), otherwise in_app/sent.
 * Deduped: skips bills that already have an unread reminder.
 */
export function useQueueRentReminders() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (dues: DueRowInput[]): Promise<number> => {
      if (!user || dues.length === 0) return 0
      const waConfigured = isWhatsAppConfigured()

      const { data: existing, error: qErr } = await supabase
        .from("notifications")
        .select("related_id")
        .eq("user_id", user.id)
        .eq("type", "rent_reminder")
        .eq("is_read", false)
      if (qErr) throw new Error(qErr.message)
      const seen = new Set(
        ((existing ?? []) as Array<{ related_id: string | null }>).map((r) => r.related_id)
      )
      const fresh = dues.filter((d) => !seen.has(d.monthlyRecordId))
      if (fresh.length === 0) return 0

      const rows = fresh.map((d) => {
        const body = waConfigured
          ? rentReminderMessage({
              tenantName: d.tenantName,
              amount: d.remainingDue.toFixed(2),
              monthLabel: monthLabel(d.year, d.month),
              propertyName: d.propertyName,
              flatNumber: d.flatNumber ?? "—",
            })
          : `Rent reminder: ${d.tenantName} owes ${d.remainingDue.toFixed(2)} for ${monthLabel(d.year, d.month)} (${d.propertyName}${d.flatNumber ? `, Flat ${d.flatNumber}` : ""}).`
        return {
          user_id: user.id,
          title: `Rent due — ${d.tenantName}`,
          body,
          type: "rent_reminder",
          related_entity: "monthly_record",
          related_id: d.monthlyRecordId,
          channel: waConfigured ? "whatsapp" : "in_app",
          status: waConfigured ? "pending" : "sent",
        }
      })
      const { error: iErr } = await supabase.from("notifications").insert(rows)
      if (iErr) throw new Error(iErr.message)
      return rows.length
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-notifications"] })
    },
  })
}

export interface GenerateBillsResult {
  created: number
  skipped: number
  monthLabel: string
}

/**
 * Bulk-generate monthly bills for all active tenancies (owner taps once per
 * month instead of creating each bill manually).
 *
 * For each ACTIVE tenancy without a bill for (year, month):
 * - applicable_rent = effective rent on the 1st of the month (latest
 *   rent_history with effective_date <= month start, else flat rent).
 *   If the owner changed rent before generating, the new rent applies.
 * - maintenance = flat's maintenance.
 * - current_bill / bore_bill / cleaning / other_charges = 0 (owner edits
 *   the bill manually to add electric/bore — these stay manual by design).
 * - previous_due = last month's remaining_due (auto-carried).
 *
 * Uses plain INSERT (no RETURNING) to avoid the RLS USING-check issue on
 * INSERT...RETURNING.
 */
export function useGenerateMonthlyBills() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async ({
      year,
      month,
    }: {
      year: number
      month: number
    }): Promise<GenerateBillsResult> => {
      // 1. Owner's properties.
      const { data: props, error: propErr } = await supabase
        .from("properties")
        .select("id")
        .eq("owner_id", user!.id)
      if (propErr) throw new Error(propErr.message)
      const propertyIds = (props ?? []).map((p) => p.id)
      if (propertyIds.length === 0) return { created: 0, skipped: 0, monthLabel: monthLabel(year, month) }

      // 2. Active tenancies with flat rent/maintenance.
      const { data: tenancies, error: tenErr } = await supabase
        .from("tenancies")
        .select("id, property_id, flat_id, flat:flats(id, rent, maintenance)")
        .in("property_id", propertyIds)
        .eq("status", "ACTIVE")
      if (tenErr) throw new Error(tenErr.message)

      // 3. Existing bills for the target month (to skip).
      const { data: existing, error: existErr } = await supabase
        .from("monthly_records")
        .select("tenancy_id")
        .eq("year", year)
        .eq("month", month)
        .in(
          "tenancy_id",
          (tenancies ?? []).map((t) => t.id)
        )
      if (existErr) throw new Error(existErr.message)
      const billedTenancyIds = new Set((existing ?? []).map((r) => r.tenancy_id))

      const monthStart = `${year}-${String(month).padStart(2, "0")}-01`
      let created = 0
      let skipped = 0

      for (const t of tenancies ?? []) {
        if (billedTenancyIds.has(t.id)) {
          skipped++
          continue
        }
        const flat = Array.isArray(t.flat) ? t.flat[0] : t.flat
        if (!flat) {
          skipped++
          continue
        }

        // Effective rent: latest rent_history <= month start, else flat rent.
        let rent = Number(flat.rent)
        const { data: rh } = await supabase
          .from("rent_history")
          .select("new_rent, effective_date")
          .eq("tenancy_id", t.id)
          .lte("effective_date", monthStart)
          .order("effective_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1)
        if (rh && rh.length > 0) rent = Number(rh[0].new_rent)

        const maintenance = Number(flat.maintenance)

        // Previous due: latest record strictly before (year, month).
        const { data: prior } = await supabase
          .from("monthly_records")
          .select("year, month, remaining_due")
          .eq("tenancy_id", t.id)
          .order("year", { ascending: false })
          .order("month", { ascending: false })
        const prev = (prior ?? []).find(
          (r) => compareMonth({ year: r.year, month: r.month }, { year, month }) < 0
        )
        const previousDue = prev ? Number(prev.remaining_due) : 0

        const totalPayable = computeTotalPayable({
          previous_due: previousDue,
          rent,
          maintenance,
          current_bill: 0,
          bore_bill: 0,
          cleaning: 0,
          other_charges: 0,
          late_fee: 0,
        })

        // Plain INSERT (no .select()) — avoids the RLS RETURNING issue.
        const { error: insErr } = await supabase.from("monthly_records").insert({
          id: crypto.randomUUID(),
          tenancy_id: t.id,
          property_id: t.property_id,
          flat_id: t.flat_id,
          year,
          month,
          applicable_rent: rent,
          maintenance,
          current_bill: 0,
          bore_bill: 0,
          cleaning: 0,
          other_charges: 0,
          late_fee: 0,
          previous_due: previousDue,
          total_payable: totalPayable,
          total_paid: 0,
          remaining_due: totalPayable,
          status: totalPayable > 0 ? "DUE" : "PAID",
          notes: "Auto-generated",
        })
        if (insErr) {
          // Skip duplicates (23505) — bill was created concurrently.
          if (insErr.code === "23505") {
            skipped++
            continue
          }
          throw new Error(insErr.message)
        }
        created++
      }

      return { created, skipped, monthLabel: monthLabel(year, month) }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["due-list"] })
      qc.invalidateQueries({ queryKey: ["monthly-records"] })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })
}
