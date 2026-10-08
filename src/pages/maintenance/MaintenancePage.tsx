import { useState } from "react"
import { format } from "date-fns"
import { Pencil, Plus, Trash2, Wrench } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
} from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import {
  MAINTENANCE_CATEGORIES,
  MAINTENANCE_STATUSES,
  statusBadgeVariant,
  statusLabel,
  useDeleteWorker,
  useMaintenanceRequests,
  useWorkers,
  type MaintenanceRequest,
  type MaintenanceStatus,
  type MaintenanceWorker,
} from "@/hooks/useMaintenanceData"
import { useMyProperties } from "@/hooks/usePropertyData"
import ReportIssueDialog from "@/components/maintenance/ReportIssueDialog"
import RequestDetailDialog from "@/components/maintenance/RequestDetailDialog"
import WorkerDialog from "@/components/maintenance/WorkerDialog"
import { cn } from "@/lib/utils"

const STATUS_COUNTS: Array<MaintenanceStatus | "ALL"> = [
  "ALL",
  ...MAINTENANCE_STATUSES,
]

function RequestCard({
  request,
  onOpen,
}: {
  request: MaintenanceRequest
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-xl border bg-card p-4 text-left shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">
            {request.category}
            {request.flat_number ? ` · Flat ${request.flat_number}` : ""}
          </p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {request.description || "No description"}
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {request.tenant_name ?? "Owner filed"} · {request.property_name ?? ""} ·{" "}
            {format(new Date(request.created_at), "d MMM yyyy")}
            {request.worker_name ? ` · ${request.worker_name}` : ""}
          </p>
        </div>
        <Badge variant={statusBadgeVariant(request.status)} className="shrink-0">
          {statusLabel(request.status)}
        </Badge>
      </div>
    </button>
  )
}

function WorkersTab() {
  const { toast } = useToast()
  const workers = useWorkers()
  const deleteWorker = useDeleteWorker()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<MaintenanceWorker | null>(null)
  const [deleting, setDeleting] = useState<MaintenanceWorker | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          People you call for repairs. Assign them to requests from the request
          detail view.
        </p>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" /> Add worker
        </Button>
      </div>

      {workers.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : workers.error ? (
        <p className="text-sm text-destructive" role="alert">
          Couldn't load workers: {(workers.error as Error).message}
        </p>
      ) : (workers.data ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Wrench className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No workers yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Add your electrician, plumber, cleaner and others here so you can
              assign them to complaints in one tap.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {(workers.data ?? []).map((w) => (
            <Card key={w.id}>
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-semibold">{w.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    {w.service && <Badge variant="info">{w.service}</Badge>}
                    {w.phone && <span>{w.phone}</span>}
                  </div>
                  {w.notes && (
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {w.notes}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    aria-label={`Edit ${w.name}`}
                    onClick={() => {
                      setEditing(w)
                      setDialogOpen(true)
                    }}
                    className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${w.name}`}
                    onClick={() => setDeleting(w)}
                    className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <WorkerDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        editing={editing}
      />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete worker?"
        message={`${deleting?.name ?? "This worker"} will be removed. Requests they were assigned to will become unassigned.`}
        confirming={deleteWorker.isPending}
        onConfirm={async () => {
          if (!deleting) return
          try {
            await deleteWorker.mutateAsync(deleting.id)
            toast("success", "Worker deleted.")
            setDeleting(null)
          } catch (e) {
            toast("error", e instanceof Error ? e.message : "Could not delete worker.")
          }
        }}
      />
    </div>
  )
}

export default function MaintenancePage() {
  const properties = useMyProperties()
  const [tab, setTab] = useState<"requests" | "workers">("requests")
  const [propertyId, setPropertyId] = useState("")
  const [status, setStatus] = useState<MaintenanceStatus | "ALL">("ALL")
  const [category, setCategory] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reportOpen, setReportOpen] = useState(false)

  const requests = useMaintenanceRequests({
    propertyId: propertyId || undefined,
    status: status === "ALL" ? undefined : status,
    category: category || undefined,
  })

  const selected =
    (requests.data ?? []).find((r) => r.id === selectedId) ?? null

  const openCount = (requests.data ?? []).filter((r) => r.status === "OPEN").length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Maintenance</h1>
          <p className="text-sm text-muted-foreground">
            Tenant complaints, workers, and resolution tracking.
            {openCount > 0 && (
              <span className="ml-2 font-medium text-status-due">
                {openCount} open
              </span>
            )}
          </p>
        </div>
        <Button
          onClick={() => setReportOpen(true)}
          disabled={(properties.data ?? []).length === 0}
          title={
            (properties.data ?? []).length === 0
              ? "Add a property first"
              : "File a maintenance request"
          }
        >
          <Plus className="mr-1.5 h-4 w-4" /> File a request
        </Button>
      </div>

      <div className="flex gap-2 border-b">
        {(
          [
            { value: "requests", label: "Requests" },
            { value: "workers", label: "Workers" },
          ] as const
        ).map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t.value
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "workers" ? (
        <WorkersTab />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="m-property">Property</Label>
              <select
                id="m-property"
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value)}
                className="flex h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
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
              <Label htmlFor="m-category">Category</Label>
              <select
                id="m-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="flex h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              >
                <option value="">All categories</option>
                {MAINTENANCE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <div className="flex flex-wrap gap-1.5">
                {STATUS_COUNTS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      status === s
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-background text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {s === "ALL" ? "All" : statusLabel(s)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {requests.isLoading ? (
            <div className="grid gap-3">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          ) : requests.error ? (
            <p className="text-sm text-destructive" role="alert">
              Couldn't load requests: {(requests.error as Error).message}
            </p>
          ) : (requests.data ?? []).length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                <Wrench className="h-8 w-8 text-muted-foreground" />
                <p className="font-medium">No maintenance requests</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  When tenants report issues from their portal, they'll appear
                  here. You can also file one yourself.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {requests.data!.map((r) => (
                <RequestCard key={r.id} request={r} onOpen={() => setSelectedId(r.id)} />
              ))}
            </div>
          )}
        </div>
      )}

      <RequestDetailDialog request={selected} onClose={() => setSelectedId(null)} />

      {/* Owner filing a request themselves: pick the first property as context. */}
      {(properties.data ?? []).length > 0 && (
        <ReportIssueDialog
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          tenantId={null}
          propertyId={propertyId || (properties.data ?? [])[0]?.id || ""}
          flatId={null}
          contextLabel="Filing as the owner"
        />
      )}
    </div>
  )
}
