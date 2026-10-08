import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { GitCompareArrows, Heart, HeartCrack } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/toast"
import {
  listingPhotoUrl,
  useSavedListings,
  useUnsaveListing,
  type ListingWithJoins,
} from "@/hooks/useMarketplace"
import { useMyTenant } from "@/hooks/useTenantPortal"
import { inr, locationLine } from "@/lib/format"
import { cn } from "@/lib/utils"

function CompareTable({ items }: { items: ListingWithJoins[] }) {
  const rows: Array<{ label: string; get: (l: ListingWithJoins) => string }> = [
    { label: "Rent / month", get: (l) => inr(l.rent ?? l.flat?.rent ?? 0) },
    { label: "Deposit", get: (l) => inr(l.deposit ?? l.flat?.deposit ?? 0) },
    { label: "Maintenance", get: (l) => inr(l.maintenance ?? l.flat?.maintenance ?? 0) },
    { label: "BHK", get: (l) => l.flat?.bhk_type ?? "—" },
    { label: "Room type", get: (l) => l.flat?.room_type ?? "—" },
    { label: "Floor", get: (l) => l.flat?.floor?.name ?? "—" },
    {
      label: "Location",
      get: (l) => locationLine(l.property?.locality, l.property?.area, l.property?.city),
    },
    { label: "Available from", get: (l) => l.available_from ?? "—" },
    {
      label: "Features",
      get: (l) => (l.flat?.features ?? []).map((x) => x.feature).join(", ") || "—",
    },
  ]
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr>
            <th className="w-32 p-2 text-left text-muted-foreground" />
            {items.map((l) => (
              <th key={l.id} className="p-2 text-left align-top">
                <Link to={`/home/find-flat/${l.id}`} className="hover:underline">
                  {l.title}
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t">
              <td className="p-2 font-medium text-muted-foreground">{r.label}</td>
              {items.map((l) => (
                <td key={l.id} className="p-2 align-top">
                  {r.get(l)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function SavedFlatsPage() {
  const { toast } = useToast()
  const myTenant = useMyTenant()
  const saved = useSavedListings()
  const unsave = useUnsaveListing()
  const [selected, setSelected] = useState<string[]>([])
  const [compareOpen, setCompareOpen] = useState(false)

  const tenantId = myTenant.data?.id
  const items = useMemo(() => saved.data ?? [], [saved.data])

  function toggleSelect(id: string) {
    setSelected((s) =>
      s.includes(id)
        ? s.filter((x) => x !== id)
        : s.length >= 3
          ? s
          : [...s, id]
    )
  }

  const compareItems = items.filter((l) => selected.includes(l.id))

  async function handleUnsave(listingId: string) {
    if (!tenantId) return
    try {
      await unsave.mutateAsync({ listingId, tenantId })
      setSelected((s) => s.filter((x) => x !== listingId))
      toast("success", "Removed from saved flats.")
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Couldn't remove it.")
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Saved Flats</h2>
          <p className="text-sm text-muted-foreground">
            Pick up to 3 to compare side by side.
          </p>
        </div>
        <Button
          disabled={selected.length < 2}
          onClick={() => setCompareOpen(true)}
        >
          <GitCompareArrows className="mr-2 h-4 w-4" />
          Compare ({selected.length})
        </Button>
      </div>

      {saved.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1].map((i) => <Skeleton key={i} className="h-56" />)}
        </div>
      ) : items.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <Heart className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="font-medium">No saved flats yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Tap the heart on any listing to save it here.
            </p>
          </div>
          <Link to="/home/find-flat">
            <Button>Find a flat</Button>
          </Link>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((l) => {
            const on = selected.includes(l.id)
            const thumb = [...(l.photos ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0]
            return (
              <Card
                key={l.id}
                className={cn("overflow-hidden", on && "ring-2 ring-primary")}
              >
                {thumb && (
                  <img src={listingPhotoUrl(thumb.storage_path)} alt="" className="h-36 w-full object-cover" />
                )}
                <div className="space-y-2 p-4">
                  <Link to={`/home/find-flat/${l.id}`} className="font-semibold leading-tight hover:underline">
                    {l.title}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {locationLine(l.property?.locality, l.property?.area, l.property?.city)}
                  </p>
                  <p className="text-lg font-bold">
                    {inr(l.rent ?? l.flat?.rent ?? 0)}
                    <span className="text-xs font-normal text-muted-foreground"> /month</span>
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={on ? "secondary" : "outline"}
                      onClick={() => toggleSelect(l.id)}
                    >
                      {on ? "Selected" : "Select to compare"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => handleUnsave(l.id)}
                      disabled={unsave.isPending}
                    >
                      <HeartCrack className="mr-1 h-3.5 w-3.5" /> Unsave
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        title="Compare flats"
        wide
      >
        <CompareTable items={compareItems} />
      </Dialog>
    </div>
  )
}
