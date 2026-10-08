import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Building2, Megaphone, Pencil, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/toast"
import ListingDialog from "@/components/listings/ListingDialog"
import {
  listingPhotoUrl,
  useDeleteListing,
  useListings,
  useUpdateListing,
  type ListingStatus,
  type ListingWithJoins,
} from "@/hooks/useMarketplace"
import { useMyProperties, useSharedProperties } from "@/hooks/usePropertyData"
import { inr } from "@/lib/format"

function statusVariant(s: ListingStatus) {
  switch (s) {
    case "PUBLISHED":
    case "FEATURED":
      return "available" as const
    case "RENTED":
      return "info" as const
    case "DRAFT":
    case "PAUSED":
    case "EXPIRED":
    default:
      return "neutral" as const
  }
}

const STATUS_FILTERS: Array<ListingStatus | "ALL"> = [
  "ALL",
  "PUBLISHED",
  "FEATURED",
  "DRAFT",
  "PAUSED",
  "RENTED",
  "EXPIRED",
]

export default function ListingsPage() {
  const { toast } = useToast()
  const [propertyFilter, setPropertyFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState<ListingStatus | "ALL">("ALL")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ListingWithJoins | null>(null)
  const [deleting, setDeleting] = useState<ListingWithJoins | null>(null)

  const myProps = useMyProperties()
  const sharedProps = useSharedProperties()
  const properties = useMemo(
    () => [...(myProps.data ?? []), ...(sharedProps.data ?? [])],
    [myProps.data, sharedProps.data]
  )
  const listingsQuery = useListings(propertyFilter || undefined)
  const updateListing = useUpdateListing()
  const deleteListing = useDeleteListing()

  const listings = useMemo(
    () =>
      (listingsQuery.data ?? []).filter(
        (l) => statusFilter === "ALL" || l.status === statusFilter
      ),
    [listingsQuery.data, statusFilter]
  )

  async function setStatus(l: ListingWithJoins, status: ListingStatus) {
    try {
      await updateListing.mutateAsync({ id: l.id, status })
      toast("success", `Listing ${status.toLowerCase()}.`)
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Couldn't update the listing.")
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    try {
      await deleteListing.mutateAsync(deleting)
      toast("success", "Listing deleted.")
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Couldn't delete the listing.")
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Listings</h2>
          <p className="text-sm text-muted-foreground">
            Advertise available flats. Published listings appear in tenant search.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="mr-2 h-4 w-4" /> New listing
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={propertyFilter}
          onChange={(e) => setPropertyFilter(e.target.value)}
        >
          <option value="">All properties</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                statusFilter === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {s === "ALL" ? "All" : s}
            </button>
          ))}
        </div>
      </div>

      {listingsQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <Megaphone className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="font-medium">No listings yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create one from an available flat to start getting enquiries.
            </p>
          </div>
          <Button
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> New listing
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {listings.map((l) => {
            const thumb = [...(l.photos ?? [])].sort(
              (a, b) => a.sort_order - b.sort_order
            )[0]
            return (
              <Card key={l.id} className="overflow-hidden">
                {thumb ? (
                  <img
                    src={listingPhotoUrl(thumb.storage_path)}
                    alt=""
                    className="h-52 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-52 items-center justify-center bg-[#F0F0F0] text-neutral-400">
                    <Building2 className="h-10 w-10" />
                  </div>
                )}
                <div className="space-y-2 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold leading-tight tracking-tight">{l.title}</p>
                    <Badge variant={statusVariant(l.status)}>{l.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {l.property?.name}
                    {l.flat?.flat_number ? ` · Flat ${l.flat.flat_number}` : ""}
                  </p>
                  <p className="text-2xl font-extrabold tracking-tight">{inr(l.rent ?? 0)}
                    <span className="text-xs font-medium text-muted-foreground"> /month</span>
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {(l.status === "DRAFT" || l.status === "PAUSED") && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setStatus(l, "PUBLISHED")}
                        disabled={updateListing.isPending}
                      >
                        Publish
                      </Button>
                    )}
                    {l.status === "PUBLISHED" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setStatus(l, "PAUSED")}
                        disabled={updateListing.isPending}
                      >
                        Pause
                      </Button>
                    )}
                    {(l.status === "RENTED" || l.status === "EXPIRED") && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setStatus(l, "PUBLISHED")}
                        disabled={updateListing.isPending}
                      >
                        Re-publish
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditing(l)
                        setDialogOpen(true)
                      }}
                    >
                      <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setDeleting(l)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                    </Button>
                  </div>
                  {l.flat_id && (
                    <Link
                      to={`/flats/${l.flat_id}`}
                      className="text-xs text-primary hover:underline"
                    >
                      View flat →
                    </Link>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <ListingDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false)
          setEditing(null)
        }}
        listing={editing}
      />

      <Dialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete listing?"
        description="The listing and its photos will be removed. This can't be undone."
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleting(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={confirmDelete}
            disabled={deleteListing.isPending}
          >
            Delete
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
