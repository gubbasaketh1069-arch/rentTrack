import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { BedDouble, DoorOpen, MapPin } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { supabase } from "@/lib/supabase"
import { inr } from "@/lib/format"

interface RawFlat {
  id: string
  flat_number: string
  bhk_type: string | null
  rent: number | string
  is_pg: boolean
  bed_count: number
  property: Array<{ id: string; name: string }> | null
  floor: Array<{ name: string }> | null
}

interface AvailableFlat {
  id: string
  flat_number: string
  bhk_type: string | null
  rent: number
  is_pg: boolean
  bed_count: number
  property: { id: string; name: string } | null
  floor: { name: string } | null
}

interface BedFill {
  flat_id: string
  count: number
}

function useAvailableFlats() {
  return useQuery({
    queryKey: ["available-flats"],
    queryFn: async (): Promise<{ flats: AvailableFlat[]; bedFill: BedFill[] }> => {
      const { data: flats, error } = await supabase
        .from("flats")
        .select(
          "id, flat_number, bhk_type, rent, is_pg, bed_count, property:properties(id, name), floor:floors(name)"
        )
        .eq("status", "AVAILABLE")
        .order("flat_number")
      if (error) throw new Error(error.message)

      const pgIds = ((flats ?? []) as RawFlat[]).filter((f) => f.is_pg).map((f) => f.id)
      let bedFill: BedFill[] = []
      if (pgIds.length > 0) {
        const { data: tenancies, error: tErr } = await supabase
          .from("tenancies")
          .select("flat_id")
          .eq("status", "ACTIVE")
          .in("flat_id", pgIds)
        if (tErr) throw new Error(tErr.message)
        const counts = new Map<string, number>()
        for (const t of (tenancies ?? []) as Array<{ flat_id: string | null }>) {
          if (!t.flat_id) continue
          counts.set(t.flat_id, (counts.get(t.flat_id) ?? 0) + 1)
        }
        bedFill = [...counts.entries()].map(([flat_id, count]) => ({ flat_id, count }))
      }

      return {
        flats: ((flats ?? []) as RawFlat[]).map((f): AvailableFlat => ({
          id: f.id,
          flat_number: f.flat_number,
          bhk_type: f.bhk_type,
          rent: Number(f.rent),
          is_pg: f.is_pg,
          bed_count: f.bed_count,
          property: f.property?.[0] ?? null,
          floor: f.floor?.[0] ?? null,
        })),
        bedFill,
      }
    },
  })
}

/** Every flat with space for a new tenant — across all of the owner's properties. */
export default function AvailableFlatsPage() {
  const q = useAvailableFlats()

  if (q.isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    )
  }

  if (q.error) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Couldn't load available flats: {(q.error as Error).message}
      </p>
    )
  }

  const { flats, bedFill } = q.data!
  const fillOf = (id: string) => bedFill.find((b) => b.flat_id === id)?.count ?? 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Available Flats</h2>
          <p className="text-sm text-muted-foreground">
            {flats.length === 0
              ? "No vacant flats right now."
              : `${flats.length} flat${flats.length === 1 ? "" : "s"} ready for a new tenant.`}
          </p>
        </div>
      </div>

      {flats.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <DoorOpen className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="max-w-sm text-sm text-muted-foreground">
              All flats are occupied. Vacant flats and PG beds with free space
              will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {flats.map((f) => (
            <Card key={f.id} className="flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{f.flat_number}</CardTitle>
                  {f.is_pg ? (
                    <Badge variant="secondary" className="gap-1">
                      <BedDouble className="h-3 w-3" />
                      {fillOf(f.id)}/{f.bed_count} beds filled
                    </Badge>
                  ) : (
                    <Badge variant="default">Available</Badge>
                  )}
                </div>
                <CardDescription>
                  {f.property?.name ?? "—"}
                  {f.floor?.name ? ` · ${f.floor.name}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                <p className="text-sm font-medium">{inr(f.rent)} / month</p>
                <div className="mt-auto flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {f.bhk_type ?? (f.is_pg ? "PG" : "Flat")}
                  </span>
                  <Link className={buttonVariants({ variant: "outline", size: "sm" })} to={`/flats/${f.id}`}>
                    Open flat
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
