import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Search, SearchX, SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  listingPhotoUrl,
  useMarketplaceSearch,
  type ListingWithJoins,
} from "@/hooks/useMarketplace"
import { FLAT_FEATURES } from "@/lib/constants"
import { inr, locationLine } from "@/lib/format"
import { cn } from "@/lib/utils"

interface Filters {
  q: string
  city: string
  area: string
  pincode: string
  minRent: string
  maxRent: string
  bhk: string
  roomType: string
  features: string[]
  availableFrom: string
}

const EMPTY: Filters = {
  q: "",
  city: "",
  area: "",
  pincode: "",
  minRent: "",
  maxRent: "",
  bhk: "",
  roomType: "",
  features: [],
  availableFrom: "",
}

function matches(l: ListingWithJoins, f: Filters): boolean {
  const prop = l.property
  const flat = l.flat
  if (!prop || !flat) return false
  const q = f.q.trim().toLowerCase()
  if (
    q &&
    !`${l.title} ${l.description ?? ""} ${prop.name} ${prop.locality ?? ""}`
      .toLowerCase()
      .includes(q)
  )
    return false
  if (f.city.trim() && !(prop.city ?? "").toLowerCase().includes(f.city.trim().toLowerCase()))
    return false
  if (f.area.trim() && !(prop.area ?? "").toLowerCase().includes(f.area.trim().toLowerCase()))
    return false
  if (f.pincode.trim() && (prop.pincode ?? "").trim() !== f.pincode.trim()) return false
  const rent = l.rent ?? flat.rent ?? 0
  if (f.minRent.trim() && rent < Number(f.minRent)) return false
  if (f.maxRent.trim() && rent > Number(f.maxRent)) return false
  if (f.bhk && (flat.bhk_type ?? "") !== f.bhk) return false
  if (f.roomType && (flat.room_type ?? "") !== f.roomType) return false
  if (f.availableFrom && (l.available_from ?? "") > f.availableFrom) return false
  if (f.features.length > 0) {
    const have = new Set((flat.features ?? []).map((x) => x.feature))
    if (!f.features.every((x) => have.has(x))) return false
  }
  return true
}

function ListingCard({ l }: { l: ListingWithJoins }) {
  const thumb = [...(l.photos ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0]
  const feats = (l.flat?.features ?? []).map((x) => x.feature)
  return (
    <Link to={`/home/find-flat/${l.id}`}>
      <Card className="overflow-hidden transition-shadow hover:shadow-md">
        {thumb ? (
          <img
            src={listingPhotoUrl(thumb.storage_path)}
            alt=""
            className="h-44 w-full object-cover"
          />
        ) : (
          <div className="flex h-44 items-center justify-center bg-muted text-muted-foreground">
            <Search className="h-8 w-8" />
          </div>
        )}
        <div className="space-y-1.5 p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold leading-tight">{l.title}</p>
            {l.status === "FEATURED" && <Badge variant="info">Featured</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {locationLine(
              l.property?.locality,
              l.property?.area,
              l.property?.city
            )}
            {l.flat?.bhk_type ? ` · ${l.flat.bhk_type}` : ""}
            {l.flat?.floor?.name ? ` · ${l.flat.floor.name} floor` : ""}
          </p>
          <p className="text-lg font-bold">
            {inr(l.rent ?? l.flat?.rent ?? 0)}
            <span className="text-xs font-normal text-muted-foreground"> /month</span>
          </p>
          {feats.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {feats.slice(0, 4).map((x) => (
                <span
                  key={x}
                  className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  {x}
                </span>
              ))}
              {feats.length > 4 && (
                <span className="text-[11px] text-muted-foreground">
                  +{feats.length - 4} more
                </span>
              )}
            </div>
          )}
        </div>
      </Card>
    </Link>
  )
}

export default function FindFlatPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY)
  const [showFilters, setShowFilters] = useState(false)
  const search = useMarketplaceSearch()

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    setFilters((f) => ({ ...f, [k]: v }))

  const bhkOptions = useMemo(() => {
    const s = new Set<string>()
    for (const l of search.data ?? []) if (l.flat?.bhk_type) s.add(l.flat.bhk_type)
    return [...s].sort()
  }, [search.data])

  const roomOptions = useMemo(() => {
    const s = new Set<string>()
    for (const l of search.data ?? []) if (l.flat?.room_type) s.add(l.flat.room_type)
    return [...s].sort()
  }, [search.data])

  const results = useMemo(
    () => (search.data ?? []).filter((l) => matches(l, filters)),
    [search.data, filters]
  )

  const activeFilterCount =
    (filters.city ? 1 : 0) +
    (filters.area ? 1 : 0) +
    (filters.pincode ? 1 : 0) +
    (filters.minRent || filters.maxRent ? 1 : 0) +
    (filters.bhk ? 1 : 0) +
    (filters.roomType ? 1 : 0) +
    (filters.features.length ? 1 : 0) +
    (filters.availableFrom ? 1 : 0)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Find a Flat</h2>
        <p className="text-sm text-muted-foreground">
          Available flats advertised by owners.
        </p>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            value={filters.q}
            onChange={(e) => set("q", e.target.value)}
            placeholder="Search by title, area, landmark…"
          />
        </div>
        <Button
          variant="outline"
          onClick={() => setShowFilters((v) => !v)}
          className={cn(activeFilterCount > 0 && "border-primary text-primary")}
        >
          <SlidersHorizontal className="mr-2 h-4 w-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-1 rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </div>

      {showFilters && (
        <Card className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label>City</Label>
              <Input className="mt-1" value={filters.city} onChange={(e) => set("city", e.target.value)} />
            </div>
            <div>
              <Label>Area / Locality</Label>
              <Input className="mt-1" value={filters.area} onChange={(e) => set("area", e.target.value)} />
            </div>
            <div>
              <Label>Pincode</Label>
              <Input className="mt-1" value={filters.pincode} onChange={(e) => set("pincode", e.target.value)} />
            </div>
            <div>
              <Label>Available from</Label>
              <Input className="mt-1" type="date" value={filters.availableFrom} onChange={(e) => set("availableFrom", e.target.value)} />
            </div>
            <div>
              <Label>Min rent ₹</Label>
              <Input className="mt-1" inputMode="numeric" value={filters.minRent} onChange={(e) => set("minRent", e.target.value)} />
            </div>
            <div>
              <Label>Max rent ₹</Label>
              <Input className="mt-1" inputMode="numeric" value={filters.maxRent} onChange={(e) => set("maxRent", e.target.value)} />
            </div>
            <div>
              <Label>BHK</Label>
              <select className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" value={filters.bhk} onChange={(e) => set("bhk", e.target.value)}>
                <option value="">Any</option>
                {bhkOptions.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <Label>Room type</Label>
              <select className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" value={filters.roomType} onChange={(e) => set("roomType", e.target.value)}>
                <option value="">Any</option>
                {roomOptions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-3">
            <Label>Must-have features</Label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {FLAT_FEATURES.map((f) => {
                const on = filters.features.includes(f)
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() =>
                      set("features", on ? filters.features.filter((x) => x !== f) : [...filters.features, f])
                    }
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium",
                      on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {f}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY)}>
              Clear all filters
            </Button>
          </div>
        </Card>
      )}

      {search.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-64" />)}
        </div>
      ) : search.error ? (
        <p className="text-sm text-destructive">Couldn't load listings. Please try again.</p>
      ) : results.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <SearchX className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="font-medium">No flats match your search</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try widening the rent range or clearing some filters.
            </p>
          </div>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {results.length} flat{results.length === 1 ? "" : "s"} available
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {results.map((l) => <ListingCard key={l.id} l={l} />)}
          </div>
        </>
      )}
    </div>
  )
}
