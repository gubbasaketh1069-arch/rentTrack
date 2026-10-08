import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"

// ---------------------------------------------------------------------------
// Types (mirror supabase/migrations/20261007000001_core_schema.sql)
// ---------------------------------------------------------------------------

export const EXPENSE_CATEGORIES = [
  "Repairs",
  "Plumbing",
  "Electrical",
  "Cleaning",
  "Maintenance",
  "Property Tax",
  "Other",
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export interface Expense {
  id: string
  property_id: string
  flat_id: string | null
  date: string
  category: ExpenseCategory
  amount: number | string
  description: string | null
  receipt_path: string | null
  created_at: string
  updated_at: string
  property?: { name: string } | null
  flat?: { flat_number: string } | null
}

export interface ExpenseFilters {
  propertyId?: string
  category?: string
  from?: string // ISO date, inclusive
  to?: string // ISO date, inclusive
  search?: string
}

export type ExpenseInput = {
  property_id: string
  flat_id: string | null
  date: string
  category: ExpenseCategory
  amount: number
  description: string | null
  receipt_path: string | null
}

const RECEIPT_BUCKET = "expense-receipts"

// Storage path convention (see supabase/migrations/20261007000003_storage.sql):
// expense-receipts/<property_id>/<uuid>-<sanitized-filename>
function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80)
}

export async function uploadExpenseReceipt(
  propertyId: string,
  file: File
): Promise<string> {
  const ext = file.name.includes(".")
    ? file.name.slice(file.name.lastIndexOf("."))
    : ""
  const path = `${propertyId}/${crypto.randomUUID()}-${sanitizeFileName(
    file.name.replace(ext, "")
  )}${ext}`
  const { error } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .upload(path, file, { upsert: false })
  if (error) throw new Error(`Receipt upload failed: ${error.message}`)
  return path
}

export async function getReceiptSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .createSignedUrl(path, 3600)
  if (error || !data?.signedUrl)
    throw new Error(`Could not open receipt: ${error?.message ?? "unknown error"}`)
  return data.signedUrl
}

export async function deleteReceiptFile(path: string): Promise<void> {
  const { error } = await supabase.storage.from(RECEIPT_BUCKET).remove([path])
  // A missing file is not fatal — the DB row is the source of truth.
  if (error && !/not found/i.test(error.message))
    throw new Error(`Could not delete receipt file: ${error.message}`)
}

function invalidateExpenses(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["expenses"] })
  qc.invalidateQueries({ queryKey: ["portfolio-stats"] })
}

export function useExpenses(filters: ExpenseFilters) {
  const { propertyId, category, from, to, search } = filters
  return useQuery({
    queryKey: ["expenses", propertyId ?? null, category ?? null, from ?? null, to ?? null, search ?? null],
    queryFn: async () => {
      let q = supabase
        .from("expenses")
        .select(
          "id, property_id, flat_id, date, category, amount, description, receipt_path, created_at, updated_at, property:properties(name), flat:flats(flat_number)"
        )
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
      if (propertyId) q = q.eq("property_id", propertyId)
      if (category) q = q.eq("category", category)
      if (from) q = q.gte("date", from)
      if (to) q = q.lte("date", to)
      if (search && search.trim()) q = q.ilike("description", `%${search.trim()}%`)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      return data as unknown as Expense[]
    },
  })
}

export function useCreateExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ExpenseInput) => {
      const { data, error } = await supabase
        .from("expenses")
        .insert({
          property_id: input.property_id,
          flat_id: input.flat_id,
          date: input.date,
          category: input.category,
          amount: input.amount,
          description: input.description,
          receipt_path: input.receipt_path,
        })
        .select("id")
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: () => invalidateExpenses(qc),
  })
}

export function useUpdateExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string
      input: Partial<ExpenseInput>
    }) => {
      const { error } = await supabase.from("expenses").update(input).eq("id", id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => invalidateExpenses(qc),
  })
}

export function useDeleteExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (expense: Expense) => {
      const { error } = await supabase
        .from("expenses")
        .delete()
        .eq("id", expense.id)
      if (error) throw new Error(error.message)
      // Remove the receipt file too (best effort — a missing file is fine).
      if (expense.receipt_path) {
        try {
          await deleteReceiptFile(expense.receipt_path)
        } catch {
          /* storage cleanup is best-effort */
        }
      }
    },
    onSuccess: () => invalidateExpenses(qc),
  })
}
