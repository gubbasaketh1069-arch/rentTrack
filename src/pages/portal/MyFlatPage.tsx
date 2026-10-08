import { useQuery } from "@tanstack/react-query"
import { BedDouble, Building2, MapPin } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import TenantGate from "@/components/portal/TenantGate"
import { supabase } from "@/lib/supabase"
import { useFlatFeatures } from "@/hooks/usePropertyData"
import { inr, locationLine } from "@/lib/format"

interface PortalFlat {
  id: string
  flat_number: string
  bhk_type: string | null
  room_type: string | null
  rent: number | null
  deposit: number | null
  maintenance: number | null
  status: string
  notes: string | null
  floor: { name: string } | null
  property: {
    name: string
    address: string | null
    area: string | null
    city: string | null
  } | null
}

function usePortalFlat(flatId: string | null | undefined) {
  return useQuery({
    queryKey: ["portal-flat", flatId],
    queryFn: async (): Promise<PortalFlat> => {
      const { data, error } = await supabase
        .from("flats")
        .select(
          "id, flat_number, bhk_type, room_type, rent, deposit, maintenance, status, notes, floor:floors(name), property:properties(name, address, area, city)"
        )
        .eq("id", flatId!)
        .single()
      if (error) throw new Error(error.message)
      const f = data as unknown as PortalFlat & {
        floor: { name: string } | { name: string }[] | null
        property: PortalFlat["property"] | Array<NonNullable<PortalFlat["property"]>> | null
      }
      return {
        ...(f as PortalFlat),
        floor: Array.isArray(f.floor) ? (f.floor[0] ?? null) : f.floor,
        property: Array.isArray(f.property) ? (f.property[0] ?? null) : f.property,
      }
    },
    enabled: !!flatId,
  })
}

function FlatBody({ flatId }: { flatId: string }) {
  const flat = usePortalFlat(flatId)
  const features = useFlatFeatures(flatId)

  if (flat.isLoading || features.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-48" />
      </div>
    )
  }

  if (flat.error || !flat.data) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Couldn't load flat details: {(flat.error as Error)?.message ?? "not found"}
      </p>
    )
  }

  const f = flat.data
  const featureLabels: string[] = features.data ?? []

  const rows: Array<[string, string]> = [
    ["Flat number", f.flat_number],
    ["Floor", f.floor?.name ?? "—"],
    ["BHK type", f.bhk_type ?? "—"],
    ["Room type", f.room_type ?? "—"],
    ["Monthly rent", f.rent != null ? inr(Number(f.rent)) : "—"],
    ["Deposit", f.deposit != null ? inr(Number(f.deposit)) : "—"],
    ["Maintenance", f.maintenance != null ? inr(Number(f.maintenance)) : "—"],
    ["Status", f.status.replace("_", " ")],
  ]

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <BedDouble className="h-5 w-5 text-muted-foreground" />
          {f.flat_number}
        </h2>
        {f.property && (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Building2 className="h-4 w-4" />
            {f.property.name}
          </p>
        )}
        {f.property && locationLine(f.property.address, f.property.area, f.property.city) !== "—" && (
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" />
            {locationLine(f.property.address, f.property.area, f.property.city)}
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Flat details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 border-b py-2 last:border-0 sm:last:border-b">
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="text-sm font-medium">
                  {label === "Status" ? (
                    <Badge variant="neutral">{value}</Badge>
                  ) : (
                    value
                  )}
                </dd>
              </div>
            ))}
          </dl>
          {f.notes && (
            <p className="mt-3 text-sm text-muted-foreground">Note: {f.notes}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Features</CardTitle>
        </CardHeader>
        <CardContent>
          {featureLabels.length === 0 ? (
            <p className="text-sm text-muted-foreground">No features listed for this flat.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {featureLabels.map((label) => (
                <Badge key={label} variant="neutral">
                  {label}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/** Tenant's own flat, read-only (spec section 32). */
export default function MyFlatPage() {
  return (
    <TenantGate>
      {({ tenancy, tenancyLoading }) => {
        if (tenancyLoading) return <Skeleton className="h-48" />
        if (!tenancy?.flat_id) {
          return (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-sm font-medium">No flat assigned</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                  You don't have an active tenancy right now.
                </p>
              </CardContent>
            </Card>
          )
        }
        return <FlatBody flatId={tenancy.flat_id} />
      }}
    </TenantGate>
  )
}
