import { useMemo, useState } from "react"
import { HeartHandshake, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import AddTenantDialog from "@/components/tenants/AddTenantDialog"
import {
  useInterests,
  useUpdateInterestStatus,
  type Interest,
  type InterestStatus,
} from "@/hooks/useMarketplace"
import { inr } from "@/lib/format"
import { cn } from "@/lib/utils"

const STATUSES: InterestStatus[] = [
  "NEW",
  "CONTACTED",
  "VISIT_SCHEDULED",
  "VISITED",
  "INTERESTED",
  "REJECTED",
  "CONVERTED",
]

function statusVariant(s: InterestStatus) {
  switch (s) {
    case "NEW":
      return "info" as const
    case "INTERESTED":
    case "CONVERTED":
      return "paid" as const
    case "REJECTED":
      return "due" as const
    default:
      return "neutral" as const
  }
}

function fmtDate(d: string | null) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export default function InterestsPage() {
  const { toast } = useToast()
  const [statusFilter, setStatusFilter] = useState<InterestStatus | "ALL">("ALL")
  const [converting, setConverting] = useState<Interest | null>(null)

  const interests = useInterests()
  const updateStatus = useUpdateInterestStatus()

  const rows = useMemo(
    () =>
      (interests.data ?? []).filter(
        (i) => statusFilter === "ALL" || i.status === statusFilter
      ),
    [interests.data, statusFilter]
  )

  async function changeStatus(i: Interest, status: InterestStatus) {
    try {
      await updateStatus.mutateAsync({ id: i.id, status })
      toast("success", `Marked as ${status.toLowerCase().replace("_", " ")}.`)
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Couldn't update the interest.")
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Interested Tenants</h2>
        <p className="text-sm text-muted-foreground">
          Enquiries on your listings. Converting reuses the tenant's existing
          record — never a duplicate.
        </p>
      </div>

      <div className="flex flex-wrap gap-1">
        {(["ALL", ...STATUSES] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium",
              statusFilter === s
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            )}
          >
            {s === "ALL" ? "All" : s.replace("_", " ")}
          </button>
        ))}
      </div>

      {interests.isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <HeartHandshake className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="font-medium">No enquiries yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Publish a listing and interested tenants will appear here.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((i) => (
            <Card key={i.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {i.tenant?.full_name ?? "Unknown tenant"}
                    {i.tenant?.primary_phone && (
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        {i.tenant.primary_phone}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {i.listing?.title ?? "Listing removed"}
                    {i.budget != null && ` · budget ${inr(i.budget)}`}
                    {i.move_in_date && ` · move-in ${fmtDate(i.move_in_date)}`}
                  </p>
                  {i.message && (
                    <p className="mt-1 text-sm italic text-muted-foreground">
                      “{i.message}”
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {fmtDate(i.created_at)}
                  </p>
                </div>
                <Badge variant={statusVariant(i.status)}>
                  {i.status.replace("_", " ")}
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {i.status !== "CONVERTED" && i.status !== "REJECTED" && (
                  <Button
                    size="sm"
                    onClick={() => setConverting(i)}
                    disabled={!i.tenant?.id}
                    title={i.tenant?.id ? "Create a tenancy for this tenant" : "Tenant record missing"}
                  >
                    <UserPlus className="mr-1 h-3.5 w-3.5" /> Convert to tenant
                  </Button>
                )}
                {STATUSES.filter(
                  (s) => s !== i.status && s !== "CONVERTED"
                ).map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant="outline"
                    onClick={() => changeStatus(i, s)}
                    disabled={updateStatus.isPending}
                  >
                    {s.replace("_", " ")}
                  </Button>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <AddTenantDialog
        open={!!converting}
        onClose={() => setConverting(null)}
        preselectedTenantId={converting?.tenant?.id}
        propertyId={converting?.property_id ?? undefined}
        flatId={converting?.flat_id ?? undefined}
        onTenantReady={async () => {
          if (converting) {
            try {
              await updateStatus.mutateAsync({ id: converting.id, status: "CONVERTED" })
            } catch {
              /* status update is best-effort; tenancy is what matters */
            }
            setConverting(null)
          }
        }}
      />
    </div>
  )
}
