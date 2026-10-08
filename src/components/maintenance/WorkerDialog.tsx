import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/toast"
import {
  useCreateWorker,
  useUpdateWorker,
  type MaintenanceWorker,
} from "@/hooks/useMaintenanceData"
import { useMyProperties } from "@/hooks/usePropertyData"

const SERVICES = ["Electrician", "Plumber", "Cleaner", "Technician", "Other"]

interface Props {
  open: boolean
  onClose: () => void
  editing: MaintenanceWorker | null
}

export default function WorkerDialog({ open, onClose, editing }: Props) {
  const { toast } = useToast()
  const properties = useMyProperties()
  const createWorker = useCreateWorker()
  const updateWorker = useUpdateWorker()

  const [propertyId, setPropertyId] = useState("")
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [service, setService] = useState("Electrician")
  const [notes, setNotes] = useState("")

  useEffect(() => {
    if (!open) return
    setPropertyId(editing?.property_id ?? "")
    setName(editing?.name ?? "")
    setPhone(editing?.phone ?? "")
    setService(editing?.service ?? "Electrician")
    setNotes(editing?.notes ?? "")
  }, [open, editing])

  const saving = createWorker.isPending || updateWorker.isPending

  async function handleSave() {
    if (!name.trim()) {
      toast("error", "Worker name is required.")
      return
    }
    try {
      const input = {
        property_id: propertyId || null,
        name: name.trim(),
        phone: phone.trim() || null,
        service,
        notes: notes.trim() || null,
      }
      if (editing) {
        await updateWorker.mutateAsync({ id: editing.id, ...input })
        toast("success", "Worker updated.")
      } else {
        await createWorker.mutateAsync(input)
        toast("success", "Worker added.")
      }
      onClose()
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Could not save worker.")
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? "Edit worker" : "Add worker"}
      description="People you call for repairs — assignable to maintenance requests."
    >
      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="worker-name">Name *</Label>
          <Input
            id="worker-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Ravi Kumar"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="worker-phone">Phone</Label>
            <Input
              id="worker-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="98765 43210"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="worker-service">Service</Label>
            <select
              id="worker-service"
              value={service}
              onChange={(e) => setService(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
            >
              {SERVICES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="worker-property">Property (optional)</Label>
          <select
            id="worker-property"
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
          >
            <option value="">All properties</option>
            {(properties.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="worker-notes">Notes</Label>
          <Input
            id="worker-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Availability, rates, …"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : "Add worker"}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
