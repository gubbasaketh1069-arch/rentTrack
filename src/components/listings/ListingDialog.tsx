import { useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ImagePlus, Loader2, X } from "lucide-react"
import { Dialog } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { supabase } from "@/lib/supabase"
import {
  listingPhotoUrl,
  uploadListingPhoto,
  useCreateListing,
  useRemoveListingPhoto,
  useUpdateListing,
  type ListingStatus,
  type ListingWithJoins,
} from "@/hooks/useMarketplace"
import { useFlats, useMyProperties, useSharedProperties } from "@/hooks/usePropertyData"
import { inr } from "@/lib/format"
import { cn } from "@/lib/utils"

const STATUSES: ListingStatus[] = [
  "DRAFT",
  "PUBLISHED",
  "FEATURED",
  "PAUSED",
  "RENTED",
  "EXPIRED",
]

interface ListingDialogProps {
  open: boolean
  onClose: () => void
  /** Fixed when launched from a flat; otherwise chosen in the form. */
  propertyId?: string
  flatId?: string
  listing?: ListingWithJoins | null
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function numOrNull(v: string): number | null {
  const t = v.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export default function ListingDialog({
  open,
  onClose,
  propertyId: fixedPropertyId,
  flatId: fixedFlatId,
  listing,
}: ListingDialogProps) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const createListing = useCreateListing()
  const updateListing = useUpdateListing()
  const removePhoto = useRemoveListingPhoto()
  const fileRef = useRef<HTMLInputElement>(null)

  const [propertyId, setPropertyId] = useState("")
  const [flatId, setFlatId] = useState("")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [rent, setRent] = useState("")
  const [deposit, setDeposit] = useState("")
  const [maintenance, setMaintenance] = useState("")
  const [status, setStatus] = useState<ListingStatus>("DRAFT")
  const [availableFrom, setAvailableFrom] = useState(todayISO())
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [pendingUrls, setPendingUrls] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const myProps = useMyProperties()
  const sharedProps = useSharedProperties()
  const properties = useMemo(
    () => [...(myProps.data ?? []), ...(sharedProps.data ?? [])],
    [myProps.data, sharedProps.data]
  )
  const flatsQuery = useFlats(propertyId || undefined)
  const availableFlats = useMemo(
    () =>
      (flatsQuery.data ?? []).filter(
        (f) => f.status === "AVAILABLE" || f.id === listing?.flat_id
      ),
    [flatsQuery.data, listing?.flat_id]
  )

  useEffect(() => {
    if (!open) return
    pendingUrls.forEach((u) => URL.revokeObjectURL(u))
    setPropertyId(fixedPropertyId ?? listing?.property_id ?? "")
    setFlatId(fixedFlatId ?? listing?.flat_id ?? "")
    setTitle(listing?.title ?? "")
    setDescription(listing?.description ?? "")
    setRent(listing?.rent != null ? String(listing.rent) : "")
    setDeposit(listing?.deposit != null ? String(listing.deposit) : "")
    setMaintenance(listing?.maintenance != null ? String(listing.maintenance) : "")
    setStatus(listing?.status ?? "DRAFT")
    setAvailableFrom(listing?.available_from ?? todayISO())
    setPendingFiles([])
    setPendingUrls([])
    setUploading(false)
    setSaving(false)
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const photos = useMemo(
    () => [...(listing?.photos ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    [listing?.photos]
  )

  /** Upload files and attach them to a listing that already exists. */
  async function attachFiles(listingId: string, propId: string, files: File[]) {
    let order = photos.length
    for (const file of files) {
      const storage_path = await uploadListingPhoto(propId, file)
      const { error: phErr } = await supabase.from("listing_photos").insert({
        listing_id: listingId,
        storage_path,
        sort_order: order++,
      })
      if (phErr) {
        await supabase.storage.from("listing-images").remove([storage_path])
        throw new Error(phErr.message)
      }
    }
  }

  async function handleSave() {
    if (!title.trim()) {
      setError("Give the listing a title.")
      return
    }
    if (!propertyId) {
      setError("Pick a property first.")
      return
    }
    const rentN = numOrNull(rent)
    if (rent.trim() && rentN === null) {
      setError("Rent must be a number ≥ 0.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (listing) {
        await updateListing.mutateAsync({
          id: listing.id,
          title: title.trim(),
          description: description.trim() || null,
          rent: rentN,
          deposit: numOrNull(deposit),
          maintenance: numOrNull(maintenance),
          status,
          available_from: availableFrom || null,
        })
        if (pendingFiles.length > 0) {
          setUploading(true)
          await attachFiles(listing.id, listing.property_id, pendingFiles)
        }
        toast("success", "Listing updated.")
      } else {
        const created = await createListing.mutateAsync({
          property_id: propertyId,
          flat_id: flatId || null,
          title: title.trim(),
          description: description.trim() || null,
          rent: rentN,
          deposit: numOrNull(deposit),
          maintenance: numOrNull(maintenance),
          status,
          available_from: availableFrom || null,
        })
        if (pendingFiles.length > 0) {
          setUploading(true)
          await attachFiles(created.id, propertyId, pendingFiles)
        }
        toast("success", "Listing created.")
      }
      qc.invalidateQueries({ queryKey: ["listings"] })
      qc.invalidateQueries({ queryKey: ["marketplace"] })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the listing.")
    } finally {
      setSaving(false)
      setUploading(false)
    }
  }

  function handlePickedFiles(files: FileList | null) {
    if (!files) return
    const imgs = Array.from(files).filter((f) => f.type.startsWith("image/"))
    setPendingFiles((p) => [...p, ...imgs])
    setPendingUrls((p) => [...p, ...imgs.map((f) => URL.createObjectURL(f))])
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={listing ? "Edit listing" : "New listing"}
      description="Advertise an available flat. Only PUBLISHED listings appear in tenant search."
      wide
    >
      <div className="space-y-4">
        {!fixedPropertyId && !listing && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Property</Label>
              <select
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={propertyId}
                onChange={(e) => {
                  setPropertyId(e.target.value)
                  setFlatId("")
                }}
              >
                <option value="">Select property…</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Flat (available only)</Label>
              <select
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={flatId}
                onChange={(e) => setFlatId(e.target.value)}
                disabled={!propertyId}
              >
                <option value="">No specific flat</option>
                {availableFlats.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.flat_number} · {inr(f.rent)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div>
          <Label>Title</Label>
          <Input
            className="mt-1"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="2BHK with balcony near HSR Layout"
          />
        </div>

        <div>
          <Label>Description</Label>
          <Textarea
            className="mt-1"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Sunlit flat, separate entrance, bore + municipal water…"
          />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <Label>Rent ₹</Label>
            <Input
              className="mt-1"
              inputMode="decimal"
              value={rent}
              onChange={(e) => setRent(e.target.value)}
              placeholder="8500"
            />
          </div>
          <div>
            <Label>Deposit ₹</Label>
            <Input
              className="mt-1"
              inputMode="decimal"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              placeholder="50000"
            />
          </div>
          <div>
            <Label>Maintenance ₹</Label>
            <Input
              className="mt-1"
              inputMode="decimal"
              value={maintenance}
              onChange={(e) => setMaintenance(e.target.value)}
              placeholder="1500"
            />
          </div>
          <div>
            <Label>Available from</Label>
            <Input
              className="mt-1"
              type="date"
              value={availableFrom}
              onChange={(e) => setAvailableFrom(e.target.value)}
            />
          </div>
        </div>

        <div>
          <Label>Status</Label>
          <div className="mt-1 flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium",
                  status === s
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent"
                )}
              >
                {s}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            When the flat becomes occupied, a PUBLISHED listing flips to RENTED
            automatically and leaves tenant search.
          </p>
        </div>

        <div>
          <Label>Photos</Label>
          <div className="mt-1 flex flex-wrap gap-2">
            {photos.map((p) => (
              <div key={p.id} className="relative">
                <img
                  src={listingPhotoUrl(p.storage_path)}
                  alt=""
                  className="h-20 w-20 rounded-md object-cover"
                />
                <button
                  type="button"
                  aria-label="Remove photo"
                  disabled={removePhoto.isPending}
                  onClick={() => removePhoto.mutate(p)}
                  className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {pendingUrls.map((u, i) => (
              <div key={`pending-${i}`} className="relative">
                <img
                  src={u}
                  alt=""
                  className="h-20 w-20 rounded-md object-cover opacity-80"
                />
                <button
                  type="button"
                  aria-label="Remove photo"
                  onClick={() => {
                    setPendingFiles((f) => f.filter((_, j) => j !== i))
                    setPendingUrls((u2) => u2.filter((_, j) => j !== i))
                  }}
                  className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-muted-foreground hover:bg-accent"
            >
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <ImagePlus className="h-5 w-5" />
              )}
              <span className="text-[11px]">Add</span>
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              handlePickedFiles(e.target.files)
              e.target.value = ""
            }}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || uploading}>
            {saving ? "Saving…" : listing ? "Save changes" : "Create listing"}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
