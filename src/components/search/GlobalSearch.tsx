import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Search } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth"
import { useOwnerPropertyIds } from "@/hooks/useReports"
import { cn } from "@/lib/utils"

interface Hit {
  kind: string
  label: string
  sub: string
  to: string
}

const KIND_ORDER = ["Tenants", "Properties", "Flats", "Payments", "Expenses", "Agreements", "Maintenance", "Listings"]

async function runSearch(q: string, propertyIds: string[]): Promise<Hit[]> {
  const like = `%${q.replace(/[%_]/g, "")}%`
  const hits: Hit[] = []
  const push = (kind: string, rows: Array<Record<string, unknown>>, label: (r: Record<string, unknown>) => string, sub: (r: Record<string, unknown>) => string, to: (r: Record<string, unknown>) => string) => {
    for (const r of rows.slice(0, 5)) hits.push({ kind, label: label(r), sub: sub(r), to: to(r) })
  }

  const [tenants, properties, flats, payments, expenses, agreements, maint, listings] = await Promise.all([
    supabase.from("tenants").select("id, full_name, primary_phone").or(`full_name.ilike.${like},primary_phone.ilike.${like}`).limit(5),
    propertyIds.length
      ? supabase.from("properties").select("id, name, city").or(`name.ilike.${like},city.ilike.${like}`).in("id", propertyIds).limit(5)
      : Promise.resolve({ data: [], error: null }),
    propertyIds.length
      ? supabase.from("flats").select("id, flat_number, property:properties(name)").or(`flat_number.ilike.${like}`).in("property_id", propertyIds).limit(5)
      : Promise.resolve({ data: [], error: null }),
    propertyIds.length
      ? supabase.from("payments").select("id, amount, transaction_id, tenant:tenants(full_name)").or(`transaction_id.ilike.${like}`).in("property_id", propertyIds).limit(5)
      : Promise.resolve({ data: [], error: null }),
    propertyIds.length
      ? supabase.from("expenses").select("id, description, amount, property:properties(name)").ilike("description", like).in("property_id", propertyIds).limit(5)
      : Promise.resolve({ data: [], error: null }),
    propertyIds.length
      ? supabase.from("rental_agreements").select("id, tenancy:tenancies!inner(property_id, tenant:tenants(full_name))").in("tenancy.property_id", propertyIds).limit(5)
      : Promise.resolve({ data: [], error: null }),
    propertyIds.length
      ? supabase.from("maintenance_requests").select("id, category, description, property:properties(name)").ilike("description", like).in("property_id", propertyIds).limit(5)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("property_listings").select("id, title, property:properties(name)").ilike("title", like).limit(5),
  ])

  const all = [tenants, properties, flats, payments, expenses, agreements, maint, listings]
  for (const r of all) {
    if (r.error) throw new Error(r.error.message)
  }

  push("Tenants", (tenants.data ?? []) as Record<string, unknown>[],
    (r) => String(r.full_name), (r) => String(r.primary_phone ?? ""),
    (r) => `/tenants/${r.id}`)
  push("Properties", (properties.data ?? []) as Record<string, unknown>[],
    (r) => String(r.name), (r) => String(r.city ?? ""),
    (r) => `/properties/${r.id}`)
  push("Flats", (flats.data ?? []) as Record<string, unknown>[],
    (r) => String(r.flat_number),
    (r) => String((r.property as { name?: string } | null)?.name ?? ""),
    (r) => `/flats/${r.id}`)
  push("Payments", (payments.data ?? []) as Record<string, unknown>[],
    (r) => `₹${Number(r.amount ?? 0).toLocaleString("en-IN")}`,
    (r) => `${String((r.tenant as { full_name?: string } | null)?.full_name ?? "")} · ${String(r.transaction_id ?? "no txn id")}`,
    () => `/tenants`)
  push("Expenses", (expenses.data ?? []) as Record<string, unknown>[],
    (r) => String(r.description ?? "Expense"),
    (r) => `${String((r.property as { name?: string } | null)?.name ?? "")} · ₹${Number(r.amount ?? 0).toLocaleString("en-IN")}`,
    () => `/expenses`)
  push("Agreements", (agreements.data ?? []) as Record<string, unknown>[],
    (r) => `Agreement — ${String((r.tenancy as { tenant?: { full_name?: string } } | null)?.tenant?.full_name ?? "")}`,
    () => "",
    () => `/agreements`)
  push("Maintenance", (maint.data ?? []) as Record<string, unknown>[],
    (r) => `${String(r.category ?? "Issue")}`,
    (r) => `${String((r.property as { name?: string } | null)?.name ?? "")} · ${String(r.description ?? "").slice(0, 60)}`,
    () => `/maintenance`)
  push("Listings", (listings.data ?? []) as Record<string, unknown>[],
    (r) => String(r.title ?? "Listing"),
    (r) => String((r.property as { name?: string } | null)?.name ?? ""),
    () => `/listings`)

  return hits.sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)
  )
}

export default function GlobalSearch() {
  const { user } = useAuth()
  const propertyIds = useOwnerPropertyIds()
  const navigate = useNavigate()
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(false)
  const [debounced, setDebounced] = useState("")
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 350)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  const { data: hits, isLoading } = useQuery({
    queryKey: ["global-search", debounced, propertyIds.join(",")],
    enabled: !!user && debounced.length >= 2,
    queryFn: () => runSearch(debounced, propertyIds),
  })

  const grouped = new Map<string, Hit[]>()
  for (const h of hits ?? []) {
    const list = grouped.get(h.kind) ?? []
    list.push(h)
    grouped.set(h.kind, list)
  }

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search tenants, properties, flats, payments…"
          className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-black"
        />
      </div>
      {open && debounced.length >= 2 && (
        <div className="absolute z-50 mt-1 max-h-[60vh] w-full overflow-y-auto rounded-md border bg-card shadow-lg">
          {isLoading ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">Searching…</p>
          ) : !hits || hits.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">No matches for “{debounced}”.</p>
          ) : (
            [...grouped.entries()].map(([kind, list]) => (
              <div key={kind}>
                <p className="bg-muted/50 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {kind}
                </p>
                {list.map((h, i) => (
                  <button
                    key={`${kind}-${i}`}
                    onClick={() => {
                      setOpen(false)
                      setQ("")
                      navigate(h.to)
                    }}
                    className={cn("flex w-full flex-col px-4 py-2 text-left hover:bg-accent")}
                  >
                    <span className="text-sm font-medium">{h.label}</span>
                    {h.sub && <span className="text-xs text-muted-foreground">{h.sub}</span>}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
