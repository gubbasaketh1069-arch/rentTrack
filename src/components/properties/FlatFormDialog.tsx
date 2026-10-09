import { useEffect, useState } from "react"
import {
  useCreateFlat,
  useUpdateFlat,
  type Flat,
  type FlatInput,
  type Floor,
} from "@/hooks/usePropertyData"
import { FLAT_FEATURES, FLAT_STATUSES, FLAT_STATUS_LABELS, BHK_OPTIONS } from "@/lib/constants"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase"
import { uploadFlatPhoto } from "@/lib/propertyPhotos"
import PhotoUploader from "@/components/properties/PhotoUploader"

interface FlatFormDialogProps {
  open: boolean
  onClose: () => void
  propertyId: string
  floors: Floor[]
  flat: Flat | null // null = create mode
  initialFeatures: string[]
  defaultFloorId?: string | null
}

function num(v: string): number {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/**
 * Create / edit a flat (spec section 7): number, floor, BHK, room type,
 * rent, deposit, maintenance, status, notes and the feature list (spec
 * section 8). Meter readings live in the meters module (later phase) —
 * meters are relational records, not flat columns.
 */
export default function FlatFormDialog({
  open,
  onClose,
  propertyId,
  floors,
  flat,
  initialFeatures,
  defaultFloorId,
}: FlatFormDialogProps) {
  const { toast } = useToast()
  const isEdit = !!flat
  const createMutation = useCreateFlat(propertyId)
  const updateMutation = useUpdateFlat(propertyId)

  const [flatNumber, setFlatNumber] = useState("")
  const [floorId, setFloorId] = useState("")
  const [bhkType, setBhkType] = useState("")
  const [roomType, setRoomType] = useState("")
  const [rent, setRent] = useState("")
  const [deposit, setDeposit] = useState("")
  const [maintenance, setMaintenance] = useState("")
  const [status, setStatus] = useState<Flat["status"]>("AVAILABLE")
  const [notes, setNotes] = useState("")
  const [features, setFeatures] = useState<string[]>([])
  const [isPg, setIsPg] = useState(false)
  const [bedCount, setBedCount] = useState("")
  const [photos, setPhotos] = useState<string[]>([])
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setFlatNumber(flat?.flat_number ?? "")
      setFloorId(flat?.floor_id ?? defaultFloorId ?? "")
      setBhkType(flat?.bhk_type ?? "")
      setRoomType(flat?.room_type ?? "")
      setRent(flat ? String(flat.rent) : "")
      setDeposit(flat ? String(flat.deposit) : "")
      setMaintenance(flat ? String(flat.maintenance) : "")
      setStatus(flat?.status ?? "AVAILABLE")
      setNotes(flat?.notes ?? "")
      setFeatures(initialFeatures)
      setIsPg(flat?.is_pg ?? false)
      setBedCount(flat && flat.bed_count > 0 ? String(flat.bed_count) : "")
      setPhotos(flat?.photos ?? [])
      setPendingPhotos([])
      setError(null)
    }
  }, [open, flat, initialFeatures, defaultFloorId])

  function toggleFeature(feature: string) {
    setFeatures((prev) =>
      prev.includes(feature)
        ? prev.filter((f) => f !== feature)
        : [...prev, feature]
    )
  }

  async function handleSubmit() {
    setError(null)
    if (!flatNumber.trim()) {
      setError("Flat number is required.")
      return
    }
    const beds = isPg ? Math.floor(Number(bedCount)) : 0
    if (isPg && !(beds > 0)) {
      setError("PG mode needs a bed count of at least 1.")
      return
    }
    const payload: FlatInput = {
      flat_number: flatNumber.trim(),
      floor_id: floorId || null,
      bhk_type: bhkType.trim() || null,
      room_type: roomType.trim() || null,
      rent: num(rent),
      deposit: num(deposit),
      maintenance: num(maintenance),
      status,
      notes: notes.trim() || null,
      is_pg: isPg,
      bed_count: beds,
      features,
      photos,
    }
    try {
      if (isEdit) {
        // Upload staged photos first so the row is saved once, with the
        // final ordered list.
        let finalPhotos = photos
        if (pendingPhotos.length > 0) {
          const uploaded: string[] = []
          for (const file of pendingPhotos) {
            uploaded.push(await uploadFlatPhoto(propertyId, flat.id, file))
          }
          finalPhotos = [...photos, ...uploaded]
        }
        await updateMutation.mutateAsync({ ...payload, photos: finalPhotos, id: flat.id })
        toast("success", `Flat ${payload.flat_number} updated.`)
      } else {
        const created = await createMutation.mutateAsync(payload)
        // Upload staged photos now that the flat (and its storage write
        // access) exists, then attach the paths to the row.
        if (pendingPhotos.length > 0) {
          try {
            const uploaded: string[] = []
            for (const file of pendingPhotos) {
              uploaded.push(await uploadFlatPhoto(propertyId, created.id, file))
            }
            const { error: phErr } = await supabase
              .from("flats")
              .update({ photos: uploaded })
              .eq("id", created.id)
            if (phErr) throw new Error(phErr.message)
          } catch (photoErr) {
            toast(
              "error",
              photoErr instanceof Error
                ? `Flat added, but photos failed: ${photoErr.message}`
                : "Flat added, but some photos failed to upload."
            )
          }
        }
        toast("success", `Flat ${payload.flat_number} added.`)
      }
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong."
      setError(message)
      toast("error", message)
    }
  }

  const saving = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit flat ${flat?.flat_number}` : "Add flat"}
      description="Rent, deposit and maintenance changes apply from now on — past monthly bills are separate records and never change."
      wide
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="flat-number">
              Flat number <span className="text-destructive">*</span>
            </Label>
            <Input
              id="flat-number"
              placeholder="G-101"
              value={flatNumber}
              onChange={(e) => setFlatNumber(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="flat-floor">Floor</Label>
            <select
              id="flat-floor"
              value={floorId}
              onChange={(e) => setFloorId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Unassigned</option>
              {floors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="flat-bhk">BHK type</Label>
            <select
              id="flat-bhk"
              value={bhkType}
              onChange={(e) => setBhkType(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Select BHK…</option>
              {BHK_OPTIONS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="flat-room">Room type</Label>
            <Input
              id="flat-room"
              placeholder="Single room, 1RK, …"
              value={roomType}
              onChange={(e) => setRoomType(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="flat-rent">Monthly rent (₹)</Label>
            <Input
              id="flat-rent"
              type="number"
              min="0"
              step="0.01"
              placeholder="8500"
              value={rent}
              onChange={(e) => setRent(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="flat-deposit">Deposit (₹)</Label>
            <Input
              id="flat-deposit"
              type="number"
              min="0"
              step="0.01"
              placeholder="30000"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="flat-maint">Maintenance (₹/mo)</Label>
            <Input
              id="flat-maint"
              type="number"
              min="0"
              step="0.01"
              placeholder="500"
              value={maintenance}
              onChange={(e) => setMaintenance(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="flat-status">Status</Label>
          <select
            id="flat-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as Flat["status"])}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {FLAT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {FLAT_STATUS_LABELS[s] ?? s.replace("_", " ")}
              </option>
            ))}
          </select>
          {status === "OCCUPIED" && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Occupied means a tenant lives here. Add the tenant via "Add
              tenant" after saving, or choose "Used by owner" if you use it
              yourself.
            </p>
          )}
          {status === "OWNER_USE" && (
            <p className="text-xs text-muted-foreground">
              This flat is used by you (the owner) — it won't appear as
              available for rent.
            </p>
          )}
        </div>

        <div className="rounded-lg border p-4">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={isPg}
              onChange={(e) => setIsPg(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            <span>
              <span className="text-sm font-medium">PG / co-living mode</span>
              <span className="block text-xs text-muted-foreground">
                Rent by bed instead of as one unit. The flat shows as occupied
                only when every bed is taken.
              </span>
            </span>
          </label>
          {isPg && (
            <div className="mt-3 max-w-[200px] space-y-2">
              <Label htmlFor="flat-beds">Number of beds *</Label>
              <Input
                id="flat-beds"
                type="number"
                min="1"
                step="1"
                placeholder="4"
                value={bedCount}
                onChange={(e) => setBedCount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                When adding a tenant, pick a free bed. Each bed is billed
                separately with its own monthly rent.
              </p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Features</Label>
          <div className="flex flex-wrap gap-2">
            {FLAT_FEATURES.map((feature) => {
              const active = features.includes(feature)
              return (
                <button
                  key={feature}
                  type="button"
                  onClick={() => toggleFeature(feature)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  {feature}
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="flat-notes">Notes</Label>
          <Textarea
            id="flat-notes"
            placeholder="Private notes about this flat"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <PhotoUploader
          label="Flat photos"
          paths={photos}
          onPathsChange={setPhotos}
          pending={pendingPhotos}
          onPendingChange={setPendingPhotos}
          disabled={saving}
        />

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add flat"}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
