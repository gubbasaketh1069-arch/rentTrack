import { useState } from "react"
import { Gauge, Pencil, Plus, RefreshCw, Trash2, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/toast"
import {
  useDeleteMeter,
  useDeleteReading,
  useMeterReadings,
  useMeterSplits,
  useMeters,
  useSetSplitStatus,
  useUpdateMeter,
  type Meter,
  type MeterSplit,
  type MeterType,
} from "@/hooks/useMeterData"
import MeterDialog from "@/components/meters/MeterDialog"
import ReplaceMeterDialog from "@/components/meters/ReplaceMeterDialog"
import ReadingDialog from "@/components/meters/ReadingDialog"
import SplitMeterBillDialog from "@/components/meters/SplitMeterBillDialog"

interface MetersTabProps {
  flatId: string
  propertyId: string | null
  flatNumber: string
}

const TYPES: MeterType[] = ["ELECTRICITY", "BORE"]

function typeLabel(t: MeterType): string {
  return t === "ELECTRICITY" ? "Electricity" : "Bore"
}

/** Spec section 30: combined display, no separate USC/Serial columns. */
function meterLine(m: Meter): string {
  const parts = [m.meter_number, m.usc ? `USC: ${m.usc}` : null].filter(Boolean)
  return parts.length > 0 ? parts.join(" / ") : "—"
}

function ReadingList({ meterId }: { meterId: string }) {
  const readings = useMeterReadings(meterId)
  const { toast } = useToast()
  const deleteMutation = useDeleteReading()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function confirmDeleteReading() {
    if (!deletingId) return
    try {
      await deleteMutation.mutateAsync(deletingId)
      toast("success", "Reading deleted.")
      setDeletingId(null)
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not delete reading.")
    }
  }

  if (readings.isLoading) return <Skeleton className="h-10 w-full" />
  if (readings.error)
    return (
      <p className="text-sm text-destructive" role="alert">
        Couldn't load readings: {(readings.error as Error).message}
      </p>
    )
  const rows = readings.data ?? []
  if (rows.length === 0)
    return (
      <p className="text-sm text-muted-foreground">No readings recorded yet.</p>
    )
  return (
    <>
      <ul className="divide-y rounded-md border">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="font-medium">{r.reading_date}</span>
              <span className="text-muted-foreground">
                {r.previous_reading ?? 0} → {r.current_reading ?? 0}
              </span>
              <Badge variant="secondary">{r.units_used ?? 0} units</Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeletingId(r.id)}
              title="Delete reading"
              className="hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={confirmDeleteReading}
        title="Delete reading"
        message="Delete this meter reading? This can't be undone."
        confirmLabel="Delete"
        confirming={deleteMutation.isPending}
      />
    </>
  )
}

function SplitHistory({ meter }: { meter: Meter }) {
  const splits = useMeterSplits(meter.id)
  const setStatus = useSetSplitStatus()
  const { toast } = useToast()

  if (splits.isLoading) return <Skeleton className="h-10 w-full" />
  if (splits.error)
    return (
      <p className="text-sm text-destructive" role="alert">
        Couldn't load splits: {(splits.error as Error).message}
      </p>
    )
  const rows = splits.data ?? []
  if (rows.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        No splits yet — the first one will appear here.
      </p>
    )
  return (
    <ul className="space-y-2">
      {rows.map((s: MeterSplit) => (
        <li key={s.id} className="rounded-lg border p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium">
              {s.month}/{s.year} · ₹{Number(s.total_amount).toFixed(2)}
            </p>
            <Badge
              variant={s.status === "APPLIED" ? "available" : s.status === "PENDING" ? "partial" : "neutral"}
            >
              {s.status}
            </Badge>
          </div>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {(s.shares ?? []).map((sh) => (
              <li key={sh.tenancy_id}>
                {sh.flat_number} · {sh.tenant_name} — ₹{Number(sh.share_amount).toFixed(2)}{" "}
                <span className="text-xs">({sh.basis})</span>
              </li>
            ))}
          </ul>
          {s.status === "PENDING" && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              disabled={setStatus.isPending}
              onClick={async () => {
                try {
                  await setStatus.mutateAsync({ split: s, status: "CANCELLED" })
                  toast("success", "Split cancelled.")
                } catch (err) {
                  toast("error", err instanceof Error ? err.message : "Could not cancel.")
                }
              }}
            >
              Cancel split
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}

function MeterCard({
  meter,
  flatId,
  propertyId,
  flatNumber,
  history,
}: {
  meter: Meter
  flatId: string
  propertyId: string | null
  flatNumber: string
  history: boolean
}) {
  const { toast } = useToast()
  const [readingOpen, setReadingOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [replaceOpen, setReplaceOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [splitOpen, setSplitOpen] = useState(false)
  const deleteMutation = useDeleteMeter(flatId)
  const updateMutation = useUpdateMeter(flatId)
  const readings = useMeterReadings(meter.is_current ? meter.id : undefined)
  const lastReading = readings.data?.[0]
  const previousForNext =
    lastReading?.current_reading != null ? Number(lastReading.current_reading) : 0

  async function confirmDelete() {
    try {
      await deleteMutation.mutateAsync(meter.id)
      toast("success", "Meter removed.")
      setDeleteOpen(false)
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not delete meter.")
    }
  }

  async function toggleShared() {
    try {
      await updateMutation.mutateAsync({
        id: meter.id,
        input: { is_shared: !meter.is_shared },
      })
      toast(
        "success",
        meter.is_shared ? "Meter is no longer shared." : "Meter marked as shared — its bill can now be split."
      )
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not update meter.")
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">
              {meterLine(meter)}{" "}
              {meter.is_current ? (
                <Badge variant="available" className="ml-1">Current</Badge>
              ) : (
                <Badge variant="neutral" className="ml-1">Replaced</Badge>
              )}
              {meter.is_shared && (
                <Badge variant="partial" className="ml-1">Shared</Badge>
              )}
            </CardTitle>
            <CardDescription>
              {[meter.serial_number ? `Serial: ${meter.serial_number}` : null,
                meter.start_date ? `From ${meter.start_date}` : null,
                meter.end_date ? `to ${meter.end_date}` : null]
                .filter(Boolean)
                .join(" ") || "—"}
            </CardDescription>
          </div>
          <div className="flex shrink-0 gap-1">
            {meter.is_current && (
              <>
                <Button variant="outline" size="sm" onClick={() => setReadingOpen(true)}>
                  <Plus className="mr-1 h-3 w-3" /> Reading
                </Button>
                {meter.is_shared && (
                  <Button variant="outline" size="sm" onClick={() => setSplitOpen(true)}>
                    Split bill
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setReplaceOpen(true)}
                  title="Replace meter"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleShared}
              title={meter.is_shared ? "Unmark as shared" : "Mark as shared"}
              disabled={updateMutation.isPending}
            >
              <Users className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditOpen(true)}
              title="Edit meter"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteOpen(true)}
              title="Delete meter"
              className="hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ReadingList meterId={meter.id} />
        {meter.is_shared && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Bill splits</p>
            <SplitHistory meter={meter} />
          </div>
        )}
      </CardContent>

      <ReadingDialog
        open={readingOpen}
        onClose={() => setReadingOpen(false)}
        meter={meter}
        previousReading={history ? null : previousForNext}
      />
      <MeterDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        flatId={flatId}
        propertyId={propertyId}
        flatNumber={flatNumber}
        type={meter.type}
        meter={meter}
      />
      {meter.is_current && (
        <ReplaceMeterDialog
          open={replaceOpen}
          onClose={() => setReplaceOpen(false)}
          flatId={flatId}
          propertyId={propertyId}
          flatNumber={flatNumber}
          oldMeter={meter}
        />
      )}
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
        title="Delete meter"
        message="Remove this meter? Only meters with no readings can be deleted — replaced meters and their readings stay in history forever."
        confirmLabel="Delete"
        confirming={deleteMutation.isPending}
      />
      {meter.is_shared && propertyId && (
        <SplitMeterBillDialog
          open={splitOpen}
          onClose={() => setSplitOpen(false)}
          meter={meter}
          propertyId={propertyId}
          flatNumber={flatNumber}
        />
      )}
    </Card>
  )
}

export default function MetersTab({ flatId, propertyId, flatNumber }: MetersTabProps) {
  const meters = useMeters(flatId)
  const [addType, setAddType] = useState<MeterType | null>(null)

  if (meters.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    )
  }
  if (meters.error) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Couldn't load meters: {(meters.error as Error).message}
      </p>
    )
  }

  const all = meters.data ?? []

  return (
    <div className="space-y-6">
      {TYPES.map((t) => {
        const ofType = all.filter((m) => m.type === t)
        const current = ofType.find((m) => m.is_current)
        const history = ofType.filter((m) => !m.is_current)
        return (
          <section key={t} className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-semibold">
                <Gauge className="h-4 w-4 text-muted-foreground" />
                {typeLabel(t)}
              </h3>
              {!current && (
                <Button size="sm" onClick={() => setAddType(t)}>
                  <Plus className="mr-1 h-3 w-3" /> Add meter
                </Button>
              )}
            </div>
            {ofType.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No {typeLabel(t).toLowerCase()} meter added for this flat yet.
              </p>
            ) : (
              <>
                {current && (
                  <MeterCard
                    meter={current}
                    flatId={flatId}
                    propertyId={propertyId}
                    flatNumber={flatNumber}
                    history={false}
                  />
                )}
                {history.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-muted-foreground">
                      Meter history
                    </p>
                    {history.map((m) => (
                      <MeterCard
                        key={m.id}
                        meter={m}
                        flatId={flatId}
                        propertyId={propertyId}
                        flatNumber={flatNumber}
                        history
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        )
      })}

      {addType && (
        <MeterDialog
          open={!!addType}
          onClose={() => setAddType(null)}
          flatId={flatId}
          propertyId={propertyId}
          flatNumber={flatNumber}
          type={addType}
        />
      )}
    </div>
  )
}
