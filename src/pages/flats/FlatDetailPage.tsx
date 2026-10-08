import { useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, BedDouble, Pencil, User } from "lucide-react"
import {
  useFlat,
  useFlatFeatures,
  useFloors,
  useProperty,
  type Flat,
} from "@/hooks/usePropertyData"
import { supabase } from "@/lib/supabase"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import FlatFormDialog from "@/components/properties/FlatFormDialog"
import AddTenantDialog from "@/components/tenants/AddTenantDialog"
import OnboardingLinkDialog from "@/components/tenants/OnboardingLinkDialog"
import EndTenancyDialog from "@/components/tenants/EndTenancyDialog"
import MetersTab from "@/components/meters/MetersTab"
import { inr } from "@/lib/format"

const FLAT_BADGE: Record<Flat["status"], "available" | "paid" | "partial" | "neutral"> = {
  AVAILABLE: "available",
  OCCUPIED: "paid",
  NOTICE_PERIOD: "partial",
  MAINTENANCE: "neutral",
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  )
}

/**
 * Flat overview (spec section 68, Overview tab). Rent, Payments, Meters and
 * History tabs land in later phases along with their data modules — only
 * the fully-working overview is shown, no dead tabs.
 */
export default function FlatDetailPage() {
  const { flatId } = useParams()
  const flat = useFlat(flatId)
  const features = useFlatFeatures(flatId)
  const property = useProperty(flat.data?.property_id)
  const floors = useFloors(flat.data?.property_id)

  const tenancies = useQuery({
    queryKey: ["flat-tenancy", flatId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenancies")
        .select("id, tenant_id, start_date, bed_number, tenant:tenants(full_name)")
        .eq("flat_id", flatId!)
        .eq("status", "ACTIVE")
        .order("bed_number", { ascending: true, nullsFirst: true })
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as Array<{
        id: string
        tenant_id: string
        start_date: string
        bed_number: number | null
        tenant: { full_name: string } | null
      }>
    },
    enabled: !!flatId,
  })

  const [editOpen, setEditOpen] = useState(false)
  const [addTenantOpen, setAddTenantOpen] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  /** Which active tenancy the End-tenancy dialog acts on (PG: one bed at a time). */
  const [endingTenancyId, setEndingTenancyId] = useState<string | null>(null)
  const [tab, setTab] = useState<"overview" | "meters">("overview")
  // Stable reference so the edit dialog's init effect doesn't re-run
  // on every parent re-render.
  const initialFeatures = useMemo(() => features.data ?? [], [features.data])

  if (flat.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (flat.error || !flat.data) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Couldn't load flat:{" "}
        {flat.error ? (flat.error as Error).message : "Not found."}
      </p>
    )
  }

  const f = flat.data
  const floorName = floors.data?.find((fl) => fl.id === f.floor_id)?.name

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to={property.data ? `/properties/${property.data.id}` : "/properties"}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "-ml-2 mb-1"
            )}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            {property.data ? property.data.name : "Properties"}
          </Link>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight">
              Flat {f.flat_number}
            </h2>
            <Badge variant={FLAT_BADGE[f.status]}>
              {f.status.replace("_", " ")}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {[floorName ? `${floorName} floor` : null, property.data?.name]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditOpen(true)}
        >
          <Pencil className="mr-1 h-3 w-3" /> Edit flat
        </Button>
      </div>

      <div className="flex gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Flat sections">
        {(["overview", "meters"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors",
              tab === t
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
      <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BedDouble className="h-4 w-4 text-muted-foreground" /> Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field label="Monthly rent" value={inr(f.rent)} />
          <Field label="Deposit" value={inr(f.deposit)} />
          <Field label="Maintenance" value={inr(f.maintenance)} />
          <Field label="BHK type" value={f.bhk_type || "—"} />
          <Field label="Room type" value={f.room_type || "—"} />
          <Field label="Floor" value={floorName || "Unassigned"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Features</CardTitle>
        </CardHeader>
        <CardContent>
          {features.isLoading ? (
            <Skeleton className="h-8 w-2/3" />
          ) : (features.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No features recorded for this flat.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(features.data ?? []).map((feat) => (
                <Badge key={feat} variant="secondary">
                  {feat}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {f.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{f.notes}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4 text-muted-foreground" />{" "}
            {f.is_pg ? `Beds (${(tenancies.data ?? []).length}/${f.bed_count} filled)` : "Current tenant"}
          </CardTitle>
          <CardDescription>
            {f.is_pg
              ? "PG mode — each bed has its own tenancy and its own bill."
              : "Determined by the flat's active tenancy."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tenancies.isLoading ? (
            <Skeleton className="h-8 w-1/2" />
          ) : f.is_pg ? (
            <div className="space-y-2">
              {(tenancies.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  All {f.bed_count} beds are free.
                </p>
              ) : (
                (tenancies.data ?? []).map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium">
                        Bed {t.bed_number ?? "?"} · {t.tenant?.full_name ?? "—"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Since {t.start_date}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Link
                        to={`/tenants/${t.tenant_id}`}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        View tenant
                      </Link>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEndingTenancyId(t.id)}
                      >
                        End tenancy
                      </Button>
                    </div>
                  </div>
                ))
              )}
              {f.status === "AVAILABLE" && (
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => setOnboardingOpen(true)}>
                    Onboarding link
                  </Button>
                  <Button size="sm" onClick={() => setAddTenantOpen(true)}>
                    + Add tenant
                  </Button>
                </div>
              )}
            </div>
          ) : (tenancies.data ?? [])[0]?.tenant ? (
            (() => {
              const t = (tenancies.data ?? [])[0]
              return (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{t.tenant!.full_name}</p>
                    <p className="text-sm text-muted-foreground">
                      Since {t.start_date}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      to={`/tenants/${t.tenant_id}`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      View tenant
                    </Link>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEndingTenancyId(t.id)}
                    >
                      End tenancy
                    </Button>
                  </div>
                </div>
              )
            })()
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                No active tenancy on this flat.
              </p>
              {f.status === "AVAILABLE" && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setOnboardingOpen(true)}>
                    Onboarding link
                  </Button>
                  <Button size="sm" onClick={() => setAddTenantOpen(true)}>
                    + Add tenant
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      </>
      ) : (
        <MetersTab flatId={f.id} propertyId={f.property_id} flatNumber={f.flat_number} />
      )}

      <FlatFormDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        propertyId={f.property_id}
        floors={floors.data ?? []}
        flat={f}
        initialFeatures={initialFeatures}
        defaultFloorId={f.floor_id}
      />

      <AddTenantDialog
        open={addTenantOpen}
        onClose={() => setAddTenantOpen(false)}
        propertyId={f.property_id}
        flatId={f.id}
      />

      <OnboardingLinkDialog
        open={onboardingOpen}
        onClose={() => setOnboardingOpen(false)}
        propertyId={f.property_id}
        flatId={f.id}
        flatNumber={f.flat_number}
      />

      {(() => {
        const ending = (tenancies.data ?? []).find((t) => t.id === endingTenancyId)
        return ending ? (
          <EndTenancyDialog
            open={!!ending}
            onClose={() => setEndingTenancyId(null)}
            tenancyId={ending.id}
            tenantId={ending.tenant_id}
            propertyId={f.property_id}
            flatId={f.id}
            flatNumber={f.is_pg ? `${f.flat_number} · Bed ${ending.bed_number ?? "?"}` : f.flat_number}
            tenantName={ending.tenant?.full_name ?? "Tenant"}
          />
        ) : null
      })()}
    </div>
  )
}
