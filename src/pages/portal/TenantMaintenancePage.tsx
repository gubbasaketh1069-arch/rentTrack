import { useState } from "react"
import { format } from "date-fns"
import { Plus, Wrench } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import TenantGate from "@/components/portal/TenantGate"
import ReportIssueDialog from "@/components/maintenance/ReportIssueDialog"
import { RequestPhotos, RequestTimeline } from "@/components/maintenance/RequestWidgets"
import {
  statusBadgeVariant,
  statusLabel,
  useMyMaintenanceRequests,
  type MaintenanceRequest,
} from "@/hooks/useMaintenanceData"

function TenantRequestCard({ request }: { request: MaintenanceRequest }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <Card>
      <CardContent className="p-4">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-start justify-between gap-3 text-left"
          aria-expanded={expanded}
        >
          <div className="min-w-0">
            <p className="font-semibold">{request.category}</p>
            <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
              {request.description || "No description"}
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Reported {format(new Date(request.created_at), "d MMM yyyy")}
              {request.worker_name ? ` · ${request.worker_name} assigned` : ""}
            </p>
          </div>
          <Badge variant={statusBadgeVariant(request.status)} className="shrink-0">
            {statusLabel(request.status)}
          </Badge>
        </button>
        {expanded && (
          <div className="mt-4 grid gap-4 border-t pt-4">
            <RequestPhotos requestId={request.id} />
            <RequestTimeline requestId={request.id} createdAt={request.created_at} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function TenantMaintenancePage() {
  const [reportOpen, setReportOpen] = useState(false)

  return (
    <TenantGate>
      {({ tenant, tenancy, tenancyLoading }) => (
        <MaintenanceBody
          tenantId={tenant.id}
          propertyId={tenancy?.property_id ?? null}
          flatId={tenancy?.flat_id ?? null}
          flatLabel={
            tenancy
              ? `Flat ${tenancy.flat?.flat_number ?? ""} · ${tenancy.property?.name ?? ""}`
              : ""
          }
          tenancyLoading={tenancyLoading}
          reportOpen={reportOpen}
          setReportOpen={setReportOpen}
        />
      )}
    </TenantGate>
  )
}

function MaintenanceBody({
  tenantId,
  propertyId,
  flatId,
  flatLabel,
  tenancyLoading,
  reportOpen,
  setReportOpen,
}: {
  tenantId: string
  propertyId: string | null
  flatId: string | null
  flatLabel: string
  tenancyLoading: boolean
  reportOpen: boolean
  setReportOpen: (v: boolean) => void
}) {
  const requests = useMyMaintenanceRequests(tenantId)

  if (tenancyLoading || requests.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    )
  }

  if (requests.error) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Couldn't load your requests: {(requests.error as Error).message}
      </p>
    )
  }

  const canReport = !!propertyId

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Maintenance</h2>
          <p className="text-sm text-muted-foreground">
            Report issues in your flat and track their status.
          </p>
        </div>
        <Button
          onClick={() => setReportOpen(true)}
          disabled={!canReport}
          title={canReport ? "Report an issue" : "No active tenancy"}
        >
          <Plus className="mr-1.5 h-4 w-4" /> Report issue
        </Button>
      </div>

      {(requests.data ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Wrench className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No issues reported</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {canReport
                ? "Leaking tap, faulty fan, electrical problem — report it here and your owner will see it right away."
                : "You don't have an active tenancy right now, so there's nothing to report against."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {requests.data!.map((r) => (
            <TenantRequestCard key={r.id} request={r} />
          ))}
        </div>
      )}

      {canReport && (
        <ReportIssueDialog
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          tenantId={tenantId}
          propertyId={propertyId}
          flatId={flatId}
          contextLabel={flatLabel}
        />
      )}
    </div>
  )
}
