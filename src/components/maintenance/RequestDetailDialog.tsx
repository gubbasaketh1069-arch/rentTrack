import { useEffect, useState } from "react"
import { format } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog, Dialog } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/toast"
import {
  MAINTENANCE_STATUSES,
  statusBadgeVariant,
  statusLabel,
  useUpdateMaintenanceRequest,
  useWorkers,
  type MaintenanceRequest,
  type MaintenanceStatus,
} from "@/hooks/useMaintenanceData"
import { RequestPhotos, RequestTimeline } from "./RequestWidgets"

const NEXT_ACTIONS: Record<MaintenanceStatus, MaintenanceStatus[]> = {
  OPEN: ["ACCEPTED", "CANCELLED"],
  ACCEPTED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["RESOLVED", "CANCELLED"],
  RESOLVED: ["IN_PROGRESS"],
  CANCELLED: ["OPEN"],
}

interface Props {
  request: MaintenanceRequest | null
  onClose: () => void
}

export default function RequestDetailDialog({ request, onClose }: Props) {
  const { toast } = useToast()
  const updateRequest = useUpdateMaintenanceRequest()
  const workers = useWorkers(request?.property_id ?? undefined)

  const [workerId, setWorkerId] = useState("")
  const [ownerNotes, setOwnerNotes] = useState("")
  const [confirmStatus, setConfirmStatus] = useState<MaintenanceStatus | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!request) return
    setWorkerId(request.worker_id ?? "")
    setOwnerNotes(request.owner_notes ?? "")
    setConfirmStatus(null)
  }, [request])

  if (!request) return null
  const r = request

  async function runUpdate(input: {
    status?: MaintenanceStatus
    worker_id?: string | null
    owner_notes?: string | null
  }) {
    setSaving(true)
    try {
      await updateRequest.mutateAsync({
        id: r.id,
        previousStatus: r.status,
        ...input,
      })
      toast("success", "Request updated.")
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Could not update the request.")
    } finally {
      setSaving(false)
    }
  }

  function handleStatusClick(next: MaintenanceStatus) {
    if (next === "RESOLVED" || next === "CANCELLED") {
      setConfirmStatus(next)
    } else {
      void runUpdate({ status: next })
    }
  }

  const assignedWorker = (workers.data ?? []).find((w) => w.id === r.worker_id)

  return (
    <>
      <Dialog
        open
        onClose={onClose}
        wide
        title={`${r.category} — ${r.flat_number ? `Flat ${r.flat_number}` : r.property_name ?? "Request"}`}
        description={`Reported ${format(new Date(r.created_at), "d MMM yyyy, h:mm a")}`}
      >
        <div className="grid gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusBadgeVariant(r.status)}>{statusLabel(r.status)}</Badge>
            {r.tenant_name && (
              <span className="text-sm text-muted-foreground">
                Reported by <span className="font-medium text-foreground">{r.tenant_name}</span>
              </span>
            )}
            {r.property_name && (
              <span className="text-sm text-muted-foreground">· {r.property_name}</span>
            )}
          </div>

          {r.description && (
            <div className="rounded-lg bg-muted/60 p-3 text-sm">{r.description}</div>
          )}

          <RequestPhotos requestId={r.id} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="req-worker">Assigned worker</Label>
              <select
                id="req-worker"
                value={workerId}
                onChange={(e) => setWorkerId(e.target.value)}
                disabled={saving || workers.isLoading}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm disabled:opacity-50"
              >
                <option value="">Unassigned</option>
                {(workers.data ?? []).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                    {w.service ? ` — ${w.service}` : ""}
                  </option>
                ))}
              </select>
              {assignedWorker?.phone && (
                <p className="text-xs text-muted-foreground">{assignedWorker.phone}</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label>Change status</Label>
              <div className="flex flex-wrap gap-2">
                {NEXT_ACTIONS[r.status].map((next) => (
                  <Button
                    key={next}
                    size="sm"
                    variant={next === "CANCELLED" ? "outline" : "secondary"}
                    disabled={saving}
                    onClick={() => handleStatusClick(next)}
                  >
                    {statusLabel(next)}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                All statuses: {MAINTENANCE_STATUSES.map(statusLabel).join(" → ")}
              </p>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="req-notes">Owner notes (visible to you only)</Label>
            <textarea
              id="req-notes"
              value={ownerNotes}
              onChange={(e) => setOwnerNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Called electrician, visiting tomorrow morning…"
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Close
            </Button>
            <Button
              onClick={() =>
                runUpdate({
                  worker_id: workerId || null,
                  owner_notes: ownerNotes.trim() || null,
                })
              }
              disabled={saving}
            >
              {saving ? "Saving…" : "Save worker & notes"}
            </Button>
          </div>

          <RequestTimeline requestId={r.id} createdAt={r.created_at} />
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmStatus !== null}
        onClose={() => setConfirmStatus(null)}
        title={confirmStatus === "RESOLVED" ? "Mark as resolved?" : "Cancel this request?"}
        message={
          confirmStatus === "RESOLVED"
            ? "The tenant will see this request as resolved in their portal."
            : "The request will be marked cancelled. This can be undone by reopening it."
        }
        confirmLabel={confirmStatus === "RESOLVED" ? "Mark resolved" : "Cancel request"}
        confirming={saving}
        onConfirm={async () => {
          if (!confirmStatus) return
          setConfirmStatus(null)
          await runUpdate({ status: confirmStatus })
        }}
      />
    </>
  )
}
