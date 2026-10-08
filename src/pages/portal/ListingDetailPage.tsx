import { useState } from "react"
import { Link, useParams } from "react-router-dom"
import { ArrowLeft, CalendarCheck, Heart, HeartHandshake, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import {
  listingPhotoUrl,
  useExpressInterest,
  useMarketplaceListing,
  useRequestVisit,
  useSaveListing,
  useSavedListings,
  useUnsaveListing,
} from "@/hooks/useMarketplace"
import { useMyTenant } from "@/hooks/useTenantPortal"
import { inr, locationLine } from "@/lib/format"
import { cn } from "@/lib/utils"

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

export default function ListingDetailPage() {
  const { id } = useParams()
  const { toast } = useToast()
  const listing = useMarketplaceListing(id)
  const myTenant = useMyTenant()
  const saved = useSavedListings()
  const save = useSaveListing()
  const unsave = useUnsaveListing()
  const express = useExpressInterest()
  const requestVisit = useRequestVisit()

  const [interestOpen, setInterestOpen] = useState(false)
  const [visitOpen, setVisitOpen] = useState(false)
  const [budget, setBudget] = useState("")
  const [moveIn, setMoveIn] = useState("")
  const [message, setMessage] = useState("")
  const [visitDate, setVisitDate] = useState("")
  const [visitNotes, setVisitNotes] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const l = listing.data ?? null
  const tenantId = myTenant.data?.id
  const isSaved = !!tenantId && (saved.data ?? []).some((s) => s.id === l?.id)

  async function toggleSave() {
    if (!l || !tenantId) return
    try {
      if (isSaved) {
        await unsave.mutateAsync({ listingId: l.id, tenantId })
        toast("success", "Removed from saved flats.")
      } else {
        await save.mutateAsync({ listingId: l.id, tenantId })
        toast("success", "Saved. Find it under Saved Flats.")
      }
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Couldn't update saved flats.")
    }
  }

  async function submitInterest() {
    if (!l || !tenantId) return
    setBusy(true)
    setError(null)
    try {
      await express.mutateAsync({
        listing_id: l.id,
        property_id: l.property_id,
        flat_id: l.flat_id,
        tenant_id: tenantId,
        budget: budget.trim() ? Number(budget) : null,
        move_in_date: moveIn || null,
        message: message.trim() || null,
      })
      toast("success", "Interest sent. The owner will be in touch.")
      setInterestOpen(false)
      setBudget("")
      setMoveIn("")
      setMessage("")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send your interest.")
    } finally {
      setBusy(false)
    }
  }

  async function submitVisit() {
    if (!l || !tenantId || !visitDate) {
      setError("Pick a preferred date and time.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      await requestVisit.mutateAsync({
        listing_id: l.id,
        tenant_id: tenantId,
        property_id: l.property_id,
        visit_date: new Date(visitDate).toISOString(),
        notes: visitNotes.trim() || null,
      })
      toast("success", "Visit requested. The owner will confirm.")
      setVisitOpen(false)
      setVisitDate("")
      setVisitNotes("")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't request the visit.")
    } finally {
      setBusy(false)
    }
  }

  if (listing.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64" />
        <Skeleton className="h-40" />
      </div>
    )
  }

  if (!l) {
    return (
      <Card className="p-10 text-center">
        <p className="font-medium">This listing isn't available anymore</p>
        <p className="mt-1 text-sm text-muted-foreground">
          It may have been rented or taken down.
        </p>
        <Link to="/home/find-flat" className="mt-4 inline-block text-sm text-primary hover:underline">
          ← Back to search
        </Link>
      </Card>
    )
  }

  const photos = [...(l.photos ?? [])].sort((a, b) => a.sort_order - b.sort_order)
  const feats = (l.flat?.features ?? []).map((x) => x.feature)

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        to="/home/find-flat"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to search
      </Link>

      {photos.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <img
            src={listingPhotoUrl(photos[0].storage_path)}
            alt=""
            className="col-span-2 h-64 w-full rounded-lg object-cover"
          />
          {photos.slice(1, 5).map((p) => (
            <img
              key={p.id}
              src={listingPhotoUrl(p.storage_path)}
              alt=""
              className="h-32 w-full rounded-lg object-cover"
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold leading-tight">{l.title}</h2>
          <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            {locationLine(
              l.property?.locality,
              l.property?.area,
              l.property?.city,
              l.property?.state,
              l.property?.pincode
            )}
          </p>
        </div>
        {l.status === "FEATURED" && <Badge variant="info">Featured</Badge>}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4 text-center">
          <p className="text-xs text-muted-foreground">Rent</p>
          <p className="text-xl font-bold">{inr(l.rent ?? l.flat?.rent ?? 0)}</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-xs text-muted-foreground">Deposit</p>
          <p className="text-xl font-bold">{inr(l.deposit ?? l.flat?.deposit ?? 0)}</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-xs text-muted-foreground">Maintenance</p>
          <p className="text-xl font-bold">{inr(l.maintenance ?? l.flat?.maintenance ?? 0)}</p>
        </Card>
      </div>

      {l.description && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">About this flat</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{l.description}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailRow label="Property" value={l.property?.name ?? "—"} />
          {l.flat?.flat_number && <DetailRow label="Flat" value={l.flat.flat_number} />}
          {l.flat?.floor?.name && <DetailRow label="Floor" value={l.flat.floor.name} />}
          {l.flat?.bhk_type && <DetailRow label="BHK" value={l.flat.bhk_type} />}
          {l.flat?.room_type && <DetailRow label="Room type" value={l.flat.room_type} />}
          {l.available_from && <DetailRow label="Available from" value={l.available_from} />}
        </CardContent>
      </Card>

      {feats.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Features</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {feats.map((f) => (
                <span key={f} className="rounded-full bg-muted px-3 py-1 text-xs">
                  {f}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant={isSaved ? "secondary" : "outline"}
          onClick={toggleSave}
          disabled={!tenantId || save.isPending || unsave.isPending}
        >
          <Heart className={cn("mr-2 h-4 w-4", isSaved && "fill-current")} />
          {isSaved ? "Saved" : "Save flat"}
        </Button>
        <Button onClick={() => setInterestOpen(true)} disabled={!tenantId}>
          <HeartHandshake className="mr-2 h-4 w-4" /> Express interest
        </Button>
        <Button variant="outline" onClick={() => setVisitOpen(true)} disabled={!tenantId}>
          <CalendarCheck className="mr-2 h-4 w-4" /> Request visit
        </Button>
      </div>
      {!tenantId && (
        <p className="text-xs text-muted-foreground">
          Your login isn't linked to a tenant record yet — ask your owner to link it.
        </p>
      )}

      <Dialog open={interestOpen} onClose={() => setInterestOpen(false)} title="Express interest">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Budget ₹ (optional)</Label>
              <Input className="mt-1" inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value)} />
            </div>
            <div>
              <Label>Move-in date (optional)</Label>
              <Input className="mt-1" type="date" value={moveIn} onChange={(e) => setMoveIn(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Message to the owner (optional)</Label>
            <Textarea className="mt-1" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Hi, I'm interested in this flat…" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setInterestOpen(false)}>Cancel</Button>
            <Button onClick={submitInterest} disabled={busy}>{busy ? "Sending…" : "Send interest"}</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={visitOpen} onClose={() => setVisitOpen(false)} title="Request a visit">
        <div className="space-y-3">
          <div>
            <Label>Preferred date & time</Label>
            <Input className="mt-1" type="datetime-local" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Textarea className="mt-1" rows={2} value={visitNotes} onChange={(e) => setVisitNotes(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setVisitOpen(false)}>Cancel</Button>
            <Button onClick={submitVisit} disabled={busy}>{busy ? "Requesting…" : "Request visit"}</Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
