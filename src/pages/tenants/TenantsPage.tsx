import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Phone, Plus, Search, Users } from "lucide-react"
import { useTenants } from "@/hooks/useTenantData"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import AddTenantDialog from "@/components/tenants/AddTenantDialog"

/**
 * Tenant directory (spec section 9): searchable list of people. Each row
 * shows the tenant's current flat via their ACTIVE tenancy — or that they
 * have none. A tenant record is a person and is reused across flats.
 */
export default function TenantsPage() {
  const [search, setSearch] = useState("")
  const [debounced, setDebounced] = useState("")
  const [addOpen, setAddOpen] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search), 350)
    return () => window.clearTimeout(t)
  }, [search])

  const tenants = useTenants(debounced)
  const rows = tenants.data ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Tenants</h2>
          <p className="text-sm text-muted-foreground">
            People renting your flats, across all properties.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Add tenant
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by name or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {tenants.isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      )}

      {tenants.error && (
        <p className="text-sm text-destructive" role="alert">
          Couldn't load tenants: {(tenants.error as Error).message}
        </p>
      )}

      {!tenants.isLoading && !tenants.error && (
        <>
          {rows.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Users className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="max-w-sm text-sm text-muted-foreground">
                  {debounced.trim()
                    ? "No tenants match your search."
                    : "No tenants yet. Add one from an available flat's + Add tenant button, or use the button above."}
                </p>
                {!debounced.trim() && (
                  <Button onClick={() => setAddOpen(true)}>
                    <Plus className="mr-1 h-4 w-4" /> Add tenant
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map((t) => (
                <Link key={t.id} to={`/tenants/${t.id}`}>
                  <Card className="transition-colors hover:border-primary/50">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base">{t.full_name}</CardTitle>
                        {t.activeTenancy ? (
                          <Badge variant="paid">Active</Badge>
                        ) : (
                          <Badge variant="neutral">No tenancy</Badge>
                        )}
                      </div>
                      {t.primary_phone && (
                        <CardDescription className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {t.primary_phone}
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        {t.activeTenancy
                          ? `${t.activeTenancy.property_name ?? "—"} · Flat ${t.activeTenancy.flat_number ?? "—"} · since ${t.activeTenancy.start_date}`
                          : "Not currently renting any flat."}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      <AddTenantDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onTenantReady={() => setAddOpen(false)}
      />
    </div>
  )
}
