import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowLeft,
  BedDouble,
  Building2,
  CircleDollarSign,
  MapPin,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  TriangleAlert,
} from "lucide-react"
import {
  useActiveTenancies,
  useDeleteFlat,
  useDeleteProperty,
  useFlats,
  useFloors,
  useOutstandingDue,
  useProperty,
  type Flat,
} from "@/hooks/usePropertyData"
import { supabase } from "@/lib/supabase"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/toast"
import FloorManager from "@/components/properties/FloorManager"
import FlatFormDialog from "@/components/properties/FlatFormDialog"
import AddTenantDialog from "@/components/tenants/AddTenantDialog"
import PropertySharing from "@/components/properties/PropertySharing"
import PhotoGallery from "@/components/properties/PhotoGallery"
import { useMyPropertyRole } from "@/hooks/useMarketplace"
import { inr, locationLine } from "@/lib/format"
import { cn } from "@/lib/utils"

const FLAT_BADGE: Record<Flat["status"], "available" | "paid" | "partial" | "neutral"> = {
  AVAILABLE: "available",
  OCCUPIED: "paid",
  NOTICE_PERIOD: "partial",
  MAINTENANCE: "neutral",
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: typeof Building2
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  )
}

function FlatCard({
  flat,
  tenantName,
  tenantId,
  onEdit,
  onDelete,
  onAddTenant,
  readOnly,
}: {
  flat: Flat
  tenantName: string | null
  tenantId: string | null
  onEdit: () => void
  onDelete: () => void
  onAddTenant: () => void
  readOnly?: boolean
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{flat.flat_number}</CardTitle>
          <Badge variant={FLAT_BADGE[flat.status]}>
            {flat.status.replace("_", " ")}
          </Badge>
        </div>
        <CardDescription>{inr(flat.rent)} / month</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        {flat.bhk_type && (
          <p className="text-xs text-muted-foreground">{flat.bhk_type}</p>
        )}
        {tenantName && (
          <p className="text-sm font-medium">{tenantName}</p>
        )}
        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          <Link
            to={`/flats/${flat.id}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            View
          </Link>
          {!readOnly && flat.status === "AVAILABLE" && (
            <Button size="sm" onClick={onAddTenant}>
              + Add tenant
            </Button>
          )}
          {flat.status === "OCCUPIED" && tenantId && (
            <Link
              to={`/tenants/${tenantId}`}
              className={buttonVariants({ size: "sm" })}
            >
              View tenant
            </Link>
          )}
          {!readOnly && (
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Pencil className="mr-1 h-3 w-3" /> Edit
            </Button>
          )}
          {!readOnly && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="mr-1 h-3 w-3" /> Delete
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Property detail (spec section 67): header stats, floor sections, flat
 * cards. "Add tenant" navigates to the tenants section, which honestly
 * states the tenant module is next — no dead buttons.
 */
export default function PropertyDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()

  const property = useProperty(id)
  const floors = useFloors(id)
  const flats = useFlats(id)
  const tenancies = useActiveTenancies(id)
  const due = useOutstandingDue(id)
  const deleteProperty = useDeleteProperty()
  const deleteFlat = useDeleteFlat(id ?? "")
  const roleQuery = useMyPropertyRole(id)
  const readOnly = roleQuery.data === "VIEWER"

  // Owner money-out for this property in the current month.
  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
  const expensesMonth = useQuery({
    queryKey: ["property-expenses-month", id, monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("amount")
        .eq("property_id", id!)
        .gte("date", monthStart)
      if (error) throw new Error(error.message)
      return (data as Array<{ amount: number | string }>).reduce(
        (s, r) => s + Number(r.amount),
        0
      )
    },
    enabled: !!id,
  })

  const [flatDialog, setFlatDialog] = useState<{
    open: boolean
    flat: Flat | null
    floorId: string | null
    features: string[]
  }>({ open: false, flat: null, floorId: null, features: [] })
  const [deletingFlat, setDeletingFlat] = useState<Flat | null>(null)
  const [deletingProperty, setDeletingProperty] = useState(false)
  const [addTenant, setAddTenant] = useState<{ flatId: string } | null>(null)

  async function openFlatDialog(flat: Flat | null, floorId: string | null) {
    let features: string[] = []
    if (flat) {
      const { data, error } = await supabase
        .from("flat_features")
        .select("feature")
        .eq("flat_id", flat.id)
      if (!error) features = (data as Array<{ feature: string }>).map((r) => r.feature)
    }
    setFlatDialog({ open: true, flat, floorId, features })
  }

  async function handleDeleteFlat() {
    if (!deletingFlat) return
    try {
      await deleteFlat.mutateAsync(deletingFlat.id)
      toast("success", `Flat ${deletingFlat.flat_number} deleted.`)
      setDeletingFlat(null)
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Something went wrong.")
    }
  }

  async function handleDeleteProperty() {
    if (!id) return
    try {
      await deleteProperty.mutateAsync(id)
      toast("success", "Property deleted.")
      navigate("/properties", { replace: true })
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Something went wrong.")
    }
  }

  if (property.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-48" />
      </div>
    )
  }

  if (property.error || !property.data) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Couldn't load property:{" "}
        {property.error ? (property.error as Error).message : "Not found."}
      </p>
    )
  }

  const p = property.data
  const flatList = flats.data ?? []
  const floorList = floors.data ?? []
  const tenantByFlat = new Map(
    (tenancies.data ?? []).map((t) => [
      t.flat_id,
      { name: t.tenant?.full_name ?? null, tenantId: t.tenant_id },
    ])
  )

  const totalFlats = flatList.length
  const occupied = flatList.filter((f) => f.status === "OCCUPIED").length
  const available = flatList.filter((f) => f.status === "AVAILABLE").length
  const expectedRent = flatList.reduce((s, f) => s + f.rent, 0)

  const unassigned = flatList.filter((f) => !f.floor_id)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to="/properties"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "-ml-2 mb-1"
            )}
          >
            <ArrowLeft className="mr-1 h-4 w-4" /> Properties
          </Link>
          <h2 className="text-2xl font-bold tracking-tight">{p.name}</h2>
          <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            {locationLine(p.locality, p.area, p.city, p.state)}
            {p.floor_structure && ` · ${p.floor_structure}`}
          </p>
        </div>
        {!readOnly && (
          <div className="flex gap-2">
            <FloorManager propertyId={p.id} floors={floorList} />
            <Link
              to={`/properties/${p.id}/edit`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Pencil className="mr-1 h-3 w-3" /> Edit
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeletingProperty(true)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="mr-1 h-3 w-3" /> Delete
            </Button>
          </div>
        )}
        {readOnly && (
          <Badge variant="neutral">View-only access</Badge>
        )}
      </div>

      {(p.photos ?? []).length > 0 && <PhotoGallery paths={p.photos} />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total flats" value={String(totalFlats)} icon={BedDouble} />
        <StatCard
          label="Occupied / Available"
          value={`${occupied} / ${available}`}
          icon={Building2}
        />
        <StatCard
          label="Expected rent"
          value={inr(expectedRent)}
          icon={CircleDollarSign}
        />
        <StatCard
          label="Outstanding due"
          value={due.isLoading ? "…" : inr(due.data ?? 0)}
          icon={TriangleAlert}
        />
        <StatCard
          label="Expenses (this month)"
          value={expensesMonth.isLoading ? "…" : inr(expensesMonth.data ?? 0)}
          icon={Receipt}
        />
      </div>

      {floors.isLoading || flats.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : floorList.length === 0 && unassigned.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Building2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="max-w-sm text-sm text-muted-foreground">
              No floors or flats yet. Add floors first, then add flats to each
              floor.
            </p>
            {!readOnly && (
              <div className="flex gap-2">
                <FloorManager propertyId={p.id} floors={floorList} />
                <Button onClick={() => openFlatDialog(null, null)}>
                  <Plus className="mr-1 h-4 w-4" /> Add flat
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {floorList.map((floor) => {
            const floorFlats = flatList.filter((f) => f.floor_id === floor.id)
            return (
              <section key={floor.id} aria-label={`Floor ${floor.name}`}>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{floor.name} floor</h3>
                  {!readOnly && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openFlatDialog(null, floor.id)}
                    >
                      <Plus className="mr-1 h-3 w-3" /> Add flat
                    </Button>
                  )}
                </div>
                {floorFlats.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    No flats on this floor yet.
                  </p>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {floorFlats.map((flat) => (
                      <FlatCard
                        key={flat.id}
                        flat={flat}
                        tenantName={tenantByFlat.get(flat.id)?.name ?? null}
                        tenantId={tenantByFlat.get(flat.id)?.tenantId ?? null}
                        onAddTenant={() => setAddTenant({ flatId: flat.id })}
                        onEdit={() => openFlatDialog(flat, flat.floor_id)}
                        onDelete={() => setDeletingFlat(flat)}
                        readOnly={readOnly}
                      />
                    ))}
                  </div>
                )}
              </section>
            )
          })}
          {unassigned.length > 0 && (
            <section aria-label="Unassigned flats">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold">Unassigned</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openFlatDialog(null, null)}
                >
                  <Plus className="mr-1 h-3 w-3" /> Add flat
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {unassigned.map((flat) => (
                  <FlatCard
                    key={flat.id}
                    flat={flat}
                    tenantName={tenantByFlat.get(flat.id)?.name ?? null}
                    tenantId={tenantByFlat.get(flat.id)?.tenantId ?? null}
                    onAddTenant={() => setAddTenant({ flatId: flat.id })}
                    onEdit={() => openFlatDialog(flat, flat.floor_id)}
                    onDelete={() => setDeletingFlat(flat)}
                    readOnly={readOnly}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <PropertySharing propertyId={p.id} />

      <FlatFormDialog
        open={flatDialog.open}
        onClose={() =>
          setFlatDialog({ open: false, flat: null, floorId: null, features: [] })
        }
        propertyId={p.id}
        floors={floorList}
        flat={flatDialog.flat}
        initialFeatures={flatDialog.features}
        defaultFloorId={flatDialog.floorId}
      />

      <ConfirmDialog
        open={!!deletingFlat}
        onClose={() => setDeletingFlat(null)}
        onConfirm={handleDeleteFlat}
        title={`Delete flat ${deletingFlat?.flat_number}?`}
        message="The flat and its feature list are removed. Tenancy, rent and payment history are separate records and are never deleted by this app — but deleting a flat with history will orphan those records, so prefer MAINTENANCE status for flats with past tenants."
        confirming={deleteFlat.isPending}
      />

      <ConfirmDialog
        open={deletingProperty}
        onClose={() => setDeletingProperty(false)}
        onConfirm={handleDeleteProperty}
        title={`Delete "${p.name}"?`}
        message="This removes the property, its floors and flats. Use this only for mistakenly created properties — historical tenant and payment records are kept separately and should normally be preserved by archiving instead."
        confirming={deleteProperty.isPending}
      />

      <AddTenantDialog
        open={!!addTenant}
        onClose={() => setAddTenant(null)}
        propertyId={p.id}
        flatId={addTenant?.flatId}
      />
    </div>
  )
}
