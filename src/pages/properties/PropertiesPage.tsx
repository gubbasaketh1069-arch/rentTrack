import { useState } from "react"
import { Link } from "react-router-dom"
import { Building2, MapPin, Plus } from "lucide-react"
import { useMyProperties, useSharedProperties } from "@/hooks/usePropertyData"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { locationLine } from "@/lib/format"
import { cn } from "@/lib/utils"

type Tab = "mine" | "shared"

function PropertyCard({
  id,
  name,
  city,
  area,
  locality,
  propertyType,
  badge,
}: {
  id: string
  name: string
  city: string | null
  area: string | null
  locality: string | null
  propertyType: string | null
  badge?: string
}) {
  return (
    <Link to={`/properties/${id}`}>
      <Card className="transition-shadow hover:shadow-md">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base leading-tight">{name}</CardTitle>
              <CardDescription className="mt-0.5 flex items-center gap-1 text-xs">
                <MapPin className="h-3 w-3" />
                {locationLine(locality, area, city)}
              </CardDescription>
            </div>
          </div>
          {badge && (
            <Badge variant="info" className="shrink-0">
              {badge}
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          {propertyType && (
            <p className="text-xs text-muted-foreground">{propertyType}</p>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Building2 className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
        <Link to="/properties/new" className={buttonVariants()}>
          <Plus className="mr-1 h-4 w-4" /> Add your first property
        </Link>
      </CardContent>
    </Card>
  )
}
export default function PropertiesPage() {
  const [tab, setTab] = useState<Tab>("mine")
  const mine = useMyProperties()
  const shared = useSharedProperties()

  const loading = tab === "mine" ? mine.isLoading : shared.isLoading
  const error = tab === "mine" ? mine.error : shared.error

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Properties</h2>
          <p className="text-sm text-muted-foreground">
            Switch between properties you own and ones shared with you.
          </p>
        </div>
        <Link to="/properties/new" className={buttonVariants()}>
          <Plus className="mr-1 h-4 w-4" /> Add Property
        </Link>
      </div>

      <div
        role="tablist"
        aria-label="Property lists"
        className="inline-flex rounded-lg border bg-card p-1"
      >
        {(
          [
            { key: "mine", label: "My Properties" },
            { key: "shared", label: "Shared Properties" },
          ] as Array<{ key: Tab; label: string }>
        ).map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
              tab === t.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-destructive" role="alert">
              Couldn't load properties: {(error as Error).message}
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && !error && tab === "mine" && (
        <>
          {mine.data!.length === 0 ? (
            <EmptyState message="No properties yet. Add your first property to start tracking floors, flats and tenants." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {mine.data!.map((p) => (
                <PropertyCard
                  key={p.id}
                  id={p.id}
                  name={p.name}
                  city={p.city}
                  area={p.area}
                  locality={p.locality}
                  propertyType={p.property_type}
                />
              ))}
            </div>
          )}
        </>
      )}

      {!loading && !error && tab === "shared" && (
        <>
          {shared.data!.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Building2 className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="max-w-sm text-sm text-muted-foreground">
                  No properties have been shared with you yet. When another
                  owner shares a property, it appears here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {shared.data!.map((p) => (
                <PropertyCard
                  key={p.id}
                  id={p.id}
                  name={p.name}
                  city={p.city}
                  area={p.area}
                  locality={p.locality}
                  propertyType={p.property_type}
                  badge={p.member_role.replace("_", " ")}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
