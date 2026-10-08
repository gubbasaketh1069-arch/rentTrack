import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth"
import { useMyProperties } from "@/hooks/usePropertyData"

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

/** Property ids the signed-in owner can access (owned + shared). */
export function useOwnerPropertyIds(): string[] {
  const { data: mine } = useMyProperties()
  return useMemo(() => (mine ?? []).map((p) => p.id), [mine])
}

export interface NameMaps {
  tenantName: (id: string | null | undefined) => string
  propertyName: (id: string | null | undefined) => string
  flatLabel: (id: string | null | undefined) => string
}

function useNameMaps(): NameMaps {
  const propertyIds = useOwnerPropertyIds()
  const { user } = useAuth()
  const { data } = useQuery({
    queryKey: ["report-name-maps", propertyIds.join(",")],
    enabled: !!user && propertyIds.length > 0,
    queryFn: async () => {
      const [t, p, f] = await Promise.all([
        supabase.from("tenants").select("id, full_name"),
        supabase.from("properties").select("id, name").in("id", propertyIds),
        supabase.from("flats").select("id, flat_number").in("property_id", propertyIds),
      ])
      if (t.error) throw new Error(t.error.message)
      if (p.error) throw new Error(p.error.message)
      if (f.error) throw new Error(f.error.message)
      return { tenants: t.data ?? [], properties: p.data ?? [], flats: f.data ?? [] }
    },
  })
  return useMemo(() => {
    const tn = new Map((data?.tenants ?? []).map((t) => [t.id, t.full_name]))
    const pn = new Map((data?.properties ?? []).map((p) => [p.id, p.name]))
    const fn = new Map((data?.flats ?? []).map((f) => [f.id, f.flat_number]))
    return {
      tenantName: (id) => (id && tn.get(id)) || "—",
      propertyName: (id) => (id && pn.get(id)) || "—",
      flatLabel: (id) => (id && fn.get(id)) || "—",
    }
  }, [data])
}

/* ------------------------------------------------------------------ */
/* Tenant report (spec §55 — 9 sheets, never any Aadhaar data)          */
/* ------------------------------------------------------------------ */

export interface TenantFullReport {
  tenant: Record<string, unknown> | null
  tenancies: Record<string, unknown>[]
  rentHistory: Record<string, unknown>[]
  monthlyRecords: Record<string, unknown>[]
  payments: Record<string, unknown>[]
  family: Record<string, unknown>[]
  meters: Record<string, unknown>[]
  advances: Record<string, unknown>[]
}

export function useTenantFullReport(tenantId: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["tenant-full-report", tenantId],
    enabled: !!user && !!tenantId,
    queryFn: async (): Promise<TenantFullReport> => {
      const [tenantRes, tenanciesRes, familyRes, advancesRes] = await Promise.all([
        supabase.from("tenants").select("*").eq("id", tenantId!).single(),
        supabase
          .from("tenancies")
          .select("*, property:properties(name), flat:flats(flat_number)")
          .eq("tenant_id", tenantId!)
          .order("start_date", { ascending: false }),
        // Aadhaar numbers deliberately excluded from every export surface.
        supabase
          .from("family_members")
          .select("id, name, relationship, dob, age, occupation, phone, joined_date, left_date, notes")
          .eq("tenant_id", tenantId!),
        supabase
          .from("advance_deposits")
          .select("*")
          .eq("tenant_id", tenantId!)
          .order("created_at", { ascending: false }),
      ])
      if (tenantRes.error) throw new Error(tenantRes.error.message)
      const tenancyIds = (tenanciesRes.data ?? []).map((t) => t.id)
      const flatIds = (tenanciesRes.data ?? []).map((t) => t.flat_id).filter(Boolean)

      const [rentRes, monthlyRes, payRes, meterRes] = await Promise.all([
        tenancyIds.length
          ? supabase.from("rent_history").select("*").in("tenancy_id", tenancyIds).order("effective_date", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        tenancyIds.length
          ? supabase.from("monthly_records").select("*").in("tenancy_id", tenancyIds).order("year", { ascending: false }).order("month", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from("payments")
          .select("*, payment_allocations(category, amount)")
          .eq("tenant_id", tenantId!)
          .order("payment_date", { ascending: false }),
        flatIds.length
          ? supabase
              .from("meters")
              .select("*, meter_readings(previous_reading, current_reading, units_used, reading_date)")
              .in("flat_id", flatIds)
          : Promise.resolve({ data: [], error: null }),
      ])
      for (const r of [tenanciesRes, rentRes, monthlyRes, payRes, meterRes, familyRes, advancesRes]) {
        if (r.error) throw new Error(r.error.message)
      }
      const { aadhaar_number: _omit, ...tenantSafe } = (tenantRes.data ?? {}) as Record<string, unknown>
      void _omit
      return {
        tenant: tenantSafe,
        tenancies: (tenanciesRes.data ?? []) as Record<string, unknown>[],
        rentHistory: (rentRes.data ?? []) as Record<string, unknown>[],
        monthlyRecords: (monthlyRes.data ?? []) as Record<string, unknown>[],
        payments: (payRes.data ?? []) as Record<string, unknown>[],
        family: (familyRes.data ?? []) as Record<string, unknown>[],
        meters: (meterRes.data ?? []) as Record<string, unknown>[],
        advances: (advancesRes.data ?? []) as Record<string, unknown>[],
      }
    },
  })
}

/* ------------------------------------------------------------------ */
/* Property / monthly / due / payment / expense reports                 */
/* ------------------------------------------------------------------ */

export function usePropertyReportData(propertyId: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["property-report", propertyId],
    enabled: !!user && !!propertyId,
    queryFn: async () => {
      const [propRes, flatsRes, tenRes, expRes] = await Promise.all([
        supabase.from("properties").select("*").eq("id", propertyId!).single(),
        supabase
          .from("flats")
          .select("*, floor:floors(name), tenancies!left(id, status, tenant:tenants(full_name))")
          .eq("property_id", propertyId!)
          .order("flat_number"),
        supabase
          .from("tenancies")
          .select("*, tenant:tenants(full_name, primary_phone), flat:flats(flat_number)")
          .eq("property_id", propertyId!)
          .order("start_date", { ascending: false }),
        supabase
          .from("expenses")
          .select("*")
          .eq("property_id", propertyId!)
          .order("date", { ascending: false })
          .limit(500),
      ])
      for (const r of [propRes, flatsRes, tenRes, expRes]) {
        if (r.error) throw new Error(r.error.message)
      }
      return { property: propRes.data, flats: flatsRes.data ?? [], tenancies: tenRes.data ?? [], expenses: expRes.data ?? [] }
    },
  })
}

export function useMonthlyReportData(year: number, month: number) {
  const propertyIds = useOwnerPropertyIds()
  const { user } = useAuth()
  return useQuery({
    queryKey: ["monthly-report", year, month, propertyIds.join(",")],
    enabled: !!user && propertyIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monthly_records")
        .select("*, tenancy:tenancies!inner(property_id, tenant:tenants(full_name), flat:flats(flat_number))")
        .eq("year", year)
        .eq("month", month)
        .in("tenancy.property_id", propertyIds)
        .order("created_at")
      if (error) throw new Error(error.message)
      return data ?? []
    },
  })
}

export function useDueReportData() {
  const propertyIds = useOwnerPropertyIds()
  const { user } = useAuth()
  return useQuery({
    queryKey: ["due-report", propertyIds.join(",")],
    enabled: !!user && propertyIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monthly_records")
        .select("*, tenancy:tenancies!inner(property_id, status, tenant:tenants(full_name, primary_phone), flat:flats(flat_number), property:properties(name))")
        .in("tenancy.property_id", propertyIds)
        .gt("remaining_due", 0)
        .order("remaining_due", { ascending: false })
      if (error) throw new Error(error.message)
      return data ?? []
    },
  })
}

export interface PaymentReportFilters {
  from?: string
  to?: string
  propertyId?: string
}

export function usePaymentReportData(filters: PaymentReportFilters) {
  const propertyIds = useOwnerPropertyIds()
  const { user } = useAuth()
  const key = JSON.stringify(filters)
  return useQuery({
    queryKey: ["payment-report", key, propertyIds.join(",")],
    enabled: !!user && propertyIds.length > 0,
    queryFn: async () => {
      let q = supabase
        .from("payments")
        .select("*, payment_allocations(category, amount), tenant:tenants(full_name), property:properties(name), flat:flats(flat_number)")
        .in("property_id", propertyIds)
        .order("payment_date", { ascending: false })
        .limit(2000)
      if (filters.from) q = q.gte("payment_date", filters.from)
      if (filters.to) q = q.lte("payment_date", filters.to)
      if (filters.propertyId) q = q.eq("property_id", filters.propertyId)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      return data ?? []
    },
  })
}

export function useExpenseReportData(filters: { from?: string; to?: string; propertyId?: string }) {
  const propertyIds = useOwnerPropertyIds()
  const { user } = useAuth()
  const key = JSON.stringify(filters)
  return useQuery({
    queryKey: ["expense-report", key, propertyIds.join(",")],
    enabled: !!user && propertyIds.length > 0,
    queryFn: async () => {
      let q = supabase
        .from("expenses")
        .select("*, property:properties(name), flat:flats(flat_number)")
        .in("property_id", propertyIds)
        .order("date", { ascending: false })
        .limit(2000)
      if (filters.from) q = q.gte("date", filters.from)
      if (filters.to) q = q.lte("date", filters.to)
      if (filters.propertyId) q = q.eq("property_id", filters.propertyId)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      return data ?? []
    },
  })
}

export function useAdvanceReportData() {
  const propertyIds = useOwnerPropertyIds()
  const { user } = useAuth()
  return useQuery({
    queryKey: ["advance-report", propertyIds.join(",")],
    enabled: !!user && propertyIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("advance_deposits")
        .select("*, tenant:tenants(full_name), tenancy:tenancies!inner(property_id, flat:flats(flat_number), property:properties(name))")
        .in("tenancy.property_id", propertyIds)
        .order("created_at", { ascending: false })
      if (error) throw new Error(error.message)
      return data ?? []
    },
  })
}

/* ------------------------------------------------------------------ */
/* Financial analytics (spec §56)                                       */
/* ------------------------------------------------------------------ */

export interface FinancialSummary {
  expectedRent: number
  rentCollected: number
  maintenanceCollected: number
  otherIncome: number
  outstandingDue: number
  expenses: number
  netIncome: number
  depositsHeld: number
}

/**
 * Net income = (rent + maintenance + other collections) − expenses.
 * Security deposits are tracked separately and NEVER counted as income.
 */
export function useFinancialSummary(year: number, month: number) {
  const propertyIds = useOwnerPropertyIds()
  const { user } = useAuth()
  return useQuery({
    queryKey: ["financial-summary", year, month, propertyIds.join(",")],
    enabled: !!user && propertyIds.length > 0,
    queryFn: async (): Promise<FinancialSummary> => {
      const from = `${year}-${String(month).padStart(2, "0")}-01`
      const toDate = new Date(year, month, 0)
      const to = `${year}-${String(month).padStart(2, "0")}-${String(toDate.getDate()).padStart(2, "0")}`

      const [recordsRes, allocRes, expRes, dueRes, depRes] = await Promise.all([
        supabase
          .from("monthly_records")
          .select("applicable_rent, tenancy:tenancies!inner(property_id)")
          .eq("year", year)
          .eq("month", month)
          .in("tenancy.property_id", propertyIds),
        supabase
          .from("payment_allocations")
          .select("category, amount, payment:payments!inner(payment_date, status, property_id)")
          .gte("payment.payment_date", from)
          .lte("payment.payment_date", to)
          .eq("payment.status", "SUCCESS")
          .in("payment.property_id", propertyIds),
        supabase
          .from("expenses")
          .select("amount")
          .in("property_id", propertyIds)
          .gte("date", from)
          .lte("date", to),
        supabase
          .from("monthly_records")
          .select("remaining_due, tenancy:tenancies!inner(property_id)")
          .in("tenancy.property_id", propertyIds)
          .gt("remaining_due", 0),
        supabase
          .from("advance_deposits")
          .select("amount_received, refunded_amount, adjusted_amount, status, tenancy:tenancies!inner(property_id)")
          .in("tenancy.property_id", propertyIds)
          .in("status", ["RECEIVED", "PARTIALLY_RECEIVED"]),
      ])
      for (const r of [recordsRes, allocRes, expRes, dueRes, depRes]) {
        if (r.error) throw new Error(r.error.message)
      }
      const expectedRent = (recordsRes.data ?? []).reduce((s, r) => s + Number(r.applicable_rent ?? 0), 0)
      let rentCollected = 0
      let maintenanceCollected = 0
      let otherIncome = 0
      for (const a of allocRes.data ?? []) {
        const amt = Number(a.amount ?? 0)
        if (a.category === "CURRENT_RENT") rentCollected += amt
        else if (a.category === "MAINTENANCE") maintenanceCollected += amt
        else otherIncome += amt
      }
      const expenses = (expRes.data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0)
      const outstandingDue = (dueRes.data ?? []).reduce((s, r) => s + Number(r.remaining_due ?? 0), 0)
      const depositsHeld = (depRes.data ?? []).reduce(
        (s, r) => s + Number(r.amount_received ?? 0) - Number(r.refunded_amount ?? 0) - Number(r.adjusted_amount ?? 0),
        0
      )
      return {
        expectedRent,
        rentCollected,
        maintenanceCollected,
        otherIncome,
        outstandingDue,
        expenses,
        netIncome: rentCollected + maintenanceCollected + otherIncome - expenses,
        depositsHeld,
      }
    },
  })
}

export interface TrendPoint {
  label: string
  expected: number
  collected: number
  expenses: number
}

/** Last N months of expected vs collected vs expenses for the trend chart. */
export function useCollectionTrend(months = 6) {
  const propertyIds = useOwnerPropertyIds()
  const { user } = useAuth()
  return useQuery({
    queryKey: ["collection-trend", months, propertyIds.join(",")],
    enabled: !!user && propertyIds.length > 0,
    queryFn: async (): Promise<TrendPoint[]> => {
      const points: TrendPoint[] = []
      const now = new Date()
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const y = d.getFullYear()
        const m = d.getMonth() + 1
        const from = `${y}-${String(m).padStart(2, "0")}-01`
        const lastDay = new Date(y, m, 0).getDate()
        const to = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
        const [recRes, payRes, expRes] = await Promise.all([
          supabase
            .from("monthly_records")
            .select("applicable_rent, tenancy:tenancies!inner(property_id)")
            .eq("year", y)
            .eq("month", m)
            .in("tenancy.property_id", propertyIds),
          supabase
            .from("payments")
            .select("amount")
            .in("property_id", propertyIds)
            .gte("payment_date", from)
            .lte("payment_date", to)
            .eq("status", "SUCCESS"),
          supabase
            .from("expenses")
            .select("amount")
            .in("property_id", propertyIds)
            .gte("date", from)
            .lte("date", to),
        ])
        if (recRes.error) throw new Error(recRes.error.message)
        if (payRes.error) throw new Error(payRes.error.message)
        if (expRes.error) throw new Error(expRes.error.message)
        points.push({
          label: d.toLocaleString("en-IN", { month: "short" }),
          expected: (recRes.data ?? []).reduce((s, r) => s + Number(r.applicable_rent ?? 0), 0),
          collected: (payRes.data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0),
          expenses: (expRes.data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0),
        })
      }
      return points
    },
  })
}

/* ------------------------------------------------------------------ */
/* Occupancy                                                           */
/* ------------------------------------------------------------------ */

export interface OccupancyRow {
  propertyId: string
  propertyName: string
  total: number
  occupied: number
  vacant: number
  rate: number
}

export function useOccupancyData() {
  const propertyIds = useOwnerPropertyIds()
  const { user } = useAuth()
  return useQuery({
    queryKey: ["occupancy-report", propertyIds.join(",")],
    enabled: !!user && propertyIds.length > 0,
    queryFn: async (): Promise<{ rows: OccupancyRow[]; vacantFlats: Array<{ id: string; flat_number: string; property: string; rent: number }> }> => {
      const { data: flats, error } = await supabase
        .from("flats")
        .select("id, flat_number, status, rent, property_id, property:properties(name)")
        .in("property_id", propertyIds)
      if (error) throw new Error(error.message)
      const byProp = new Map<string, { propertyId: string; propertyName: string; total: number; occupied: number; vacant: number }>()
      const vacantFlats: Array<{ id: string; flat_number: string; property: string; rent: number }> = []
      for (const f of flats ?? []) {
        const propName = (f.property as { name?: string } | null)?.name ?? "—"
        let row = byProp.get(f.property_id)
        if (!row) {
          row = { propertyId: f.property_id, propertyName: propName, total: 0, occupied: 0, vacant: 0 }
          byProp.set(f.property_id, row)
        }
        row.total += 1
        if (f.status === "OCCUPIED") row.occupied += 1
        else {
          row.vacant += 1
          vacantFlats.push({ id: f.id, flat_number: f.flat_number, property: propName, rent: Number(f.rent ?? 0) })
        }
      }
      const rows: OccupancyRow[] = [...byProp.values()].map((r) => ({
        ...r,
        rate: r.total ? Math.round((r.occupied / r.total) * 100) : 0,
      }))
      return { rows, vacantFlats }
    },
  })
}

/* ------------------------------------------------------------------ */
/* Smart alerts (spec §57)                                              */
/* ------------------------------------------------------------------ */

export interface SmartAlert {
  kind: string
  title: string
  detail: string
  severity: "red" | "orange" | "blue"
  to: string
}

export function useSmartAlerts() {
  const propertyIds = useOwnerPropertyIds()
  const { user } = useAuth()
  return useQuery({
    queryKey: ["smart-alerts", propertyIds.join(",")],
    enabled: !!user && propertyIds.length > 0,
    queryFn: async (): Promise<SmartAlert[]> => {
      const alerts: SmartAlert[] = []
      const now = new Date()
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
      const in30 = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10)

      const [dueRes, agrRes, maintRes, vacantRes, intRes, partialRes, meterRes] = await Promise.all([
        supabase
          .from("monthly_records")
          .select("remaining_due, tenancy:tenancies!inner(property_id)")
          .in("tenancy.property_id", propertyIds)
          .gt("remaining_due", 0),
        supabase
          .from("rental_agreements")
          .select("id, end_date, tenancy:tenancies!inner(property_id, tenant:tenants(full_name))")
          .in("tenancy.property_id", propertyIds)
          .lte("end_date", in30)
          .gte("end_date", now.toISOString().slice(0, 10)),
        supabase
          .from("maintenance_requests")
          .select("id", { count: "exact", head: true })
          .in("property_id", propertyIds)
          .eq("status", "OPEN"),
        supabase
          .from("flats")
          .select("id", { count: "exact", head: true })
          .in("property_id", propertyIds)
          .eq("status", "AVAILABLE"),
        supabase
          .from("tenant_interests")
          .select("id", { count: "exact", head: true })
          .in("property_id", propertyIds)
          .eq("status", "NEW"),
        supabase
          .from("monthly_records")
          .select("id", { count: "exact", head: true })
          .eq("status", "PARTIAL"),
        supabase
          .from("meters")
          .select("id, flat_id, flats!inner(property_id)")
          .in("flats.property_id", propertyIds)
          .is("end_date", null),
      ])
      for (const r of [dueRes, agrRes, maintRes, vacantRes, intRes, partialRes, meterRes]) {
        if (r.error) throw new Error(r.error.message)
      }

      const dueRows = (dueRes.data ?? []) as Array<{ remaining_due: number | string }>
      if (dueRows.length > 0) {
        const total = dueRows.reduce((s, r) => s + Number(r.remaining_due ?? 0), 0)
        alerts.push({
          kind: "due",
          title: "Outstanding dues",
          detail: `${dueRows.length} unpaid bill${dueRows.length === 1 ? "" : "s"} totalling ${total.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })}`,
          severity: "red",
          to: "/due",
        })
      }
      const agrCount = (agrRes.data ?? []).length
      if (agrCount > 0) {
        alerts.push({
          kind: "agreements",
          title: "Agreements expiring soon",
          detail: `${agrCount} agreement${agrCount === 1 ? "" : "s"} expire within 30 days`,
          severity: "orange",
          to: "/agreements",
        })
      }
      const openCount = maintRes.count ?? 0
      if (openCount > 0) {
        alerts.push({
          kind: "maintenance",
          title: "Pending maintenance",
          detail: `${openCount} open request${openCount === 1 ? "" : "s"} need attention`,
          severity: "orange",
          to: "/maintenance",
        })
      }
      const vacantCount = vacantRes.count ?? 0
      if (vacantCount > 0) {
        alerts.push({
          kind: "vacant",
          title: "Vacant flats",
          detail: `${vacantCount} flat${vacantCount === 1 ? "" : "s"} available for listing`,
          severity: "blue",
          to: "/properties",
        })
      }
      const newCount = intRes.count ?? 0
      if (newCount > 0) {
        alerts.push({
          kind: "interests",
          title: "New listing enquiries",
          detail: `${newCount} new tenant interest${newCount === 1 ? "" : "s"}`,
          severity: "blue",
          to: "/interests",
        })
      }
      const partialCount = partialRes.count ?? 0
      if (partialCount > 0) {
        alerts.push({
          kind: "partial",
          title: "Partial payments",
          detail: `${partialCount} bill${partialCount === 1 ? "" : "s"} partially paid`,
          severity: "orange",
          to: "/due",
        })
      }
      // Meters with no reading this month.
      const meters = (meterRes.data ?? []) as Array<{ id: string }>
      if (meters.length > 0) {
        const { data: readings, error } = await supabase
          .from("meter_readings")
          .select("meter_id")
          .in("meter_id", meters.map((m) => m.id))
          .gte("reading_date", monthStart)
        if (error) throw new Error(error.message)
        const readSet = new Set((readings ?? []).map((r) => r.meter_id))
        const missing = meters.length - readSet.size
        if (missing > 0) {
          alerts.push({
            kind: "meters",
            title: "Pending meter readings",
            detail: `${missing} meter${missing === 1 ? "" : "s"} have no reading this month`,
            severity: "blue",
            to: "/properties",
          })
        }
      }
      return alerts
    },
  })
}

/** Bill anomaly: this month's total > 1.5× the tenant's 3-month average. Wording never claims a cause. */
export function useBillAnomalies() {
  const propertyIds = useOwnerPropertyIds()
  const { user } = useAuth()
  return useQuery({
    queryKey: ["bill-anomalies", propertyIds.join(",")],
    enabled: !!user && propertyIds.length > 0,
    queryFn: async (): Promise<Array<{ tenancyId: string; tenant: string; flat: string; month: string; total: number; average: number }>> => {
      const now = new Date()
      const out: Array<{ tenancyId: string; tenant: string; flat: string; month: string; total: number; average: number }> = []
      // Look at the last 4 months of records per active tenancy.
      const from = new Date(now.getFullYear(), now.getMonth() - 4, 1)
      const { data, error } = await supabase
        .from("monthly_records")
        .select("tenancy_id, year, month, total_payable, tenancy:tenancies!inner(property_id, status, tenant:tenants(full_name), flat:flats(flat_number))")
        .in("tenancy.property_id", propertyIds)
        .gte("year", from.getFullYear())
        .order("year", { ascending: false })
        .order("month", { ascending: false })
        .limit(4000)
      if (error) throw new Error(error.message)
      const byTenancy = new Map<string, Array<{ total: number; label: string; tenant: string; flat: string }>>()
      for (const r of data ?? []) {
        const t = r.tenancy as unknown as { status: string; tenant?: { full_name?: string }; flat?: { flat_number?: string } }
        const list = byTenancy.get(r.tenancy_id) ?? []
        list.push({
          total: Number(r.total_payable ?? 0),
          label: `${String(r.month).padStart(2, "0")}/${r.year}`,
          tenant: t.tenant?.full_name ?? "—",
          flat: t.flat?.flat_number ?? "—",
        })
        byTenancy.set(r.tenancy_id, list)
      }
      for (const [tenancyId, list] of byTenancy) {
        if (list.length < 4) continue
        const [latest, ...prev] = list
        const avg = prev.slice(0, 3).reduce((s, r) => s + r.total, 0) / 3
        if (avg > 0 && latest.total > avg * 1.5) {
          out.push({ tenancyId, tenant: latest.tenant, flat: latest.flat, month: latest.label, total: latest.total, average: Math.round(avg) })
        }
      }
      return out
    },
  })
}

/* ------------------------------------------------------------------ */
/* Activity log                                                        */
/* ------------------------------------------------------------------ */

export function useActivityLogs(limit = 200) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["activity-logs", limit],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_logs")
        .select("*, actor:profiles(full_name, email), property:properties(name)")
        .order("created_at", { ascending: false })
        .limit(limit)
      if (error) throw new Error(error.message)
      return data ?? []
    },
  })
}

export { useNameMaps }
