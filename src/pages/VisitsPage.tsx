import { useMemo, useState } from "react"
import { CalendarCheck, CalendarX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import {
  useUpdateVisitStatus,
  useVisits,
  type Visit,
  type VisitStatus,
} from "@/hooks/useMarketplace"
import { cn } from "@/lib/utils"

const STATUSES: VisitStatus[] = ["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED"]

function statusVariant(s: VisitStatus) {
  switch (s) {
    case "REQUESTED":
      return "info" as const
    case "CONFIRMED":
      return "paid" as const
    case "COMPLETED":
      return "neutral" as const
    case "CANCELLED":
    default:
      return "due" as const
  }
}

function fmtDateTime(d: string | null) {
  if (!d) return "—"
  return new Date(d).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  })
}

export default function VisitsPage() {
  const { toast } = useToast()
  const [statusFilter, setStatusFilter] = useState<VisitStatus | "ALL">("ALL")
  const visits = useVisits()
  const updateStatus = useUpdateVisitStatus()

  const rows = useMemo(() => {
    const all = [...(visits.data ?? [])].sort((a, b) => {
      // Open requests first, then by date.
      const open = (s: VisitStatus) => (s === "REQUESTED" || s === "CONFIRMED" ? 0 : 1)
      return open(a.status) - open(b.status) ||
        (a.visit_date ?? "").localeCompare(b.visit_date ?? "")
    })
    return all.filter((v) => statusFilter === "ALL" || v.status === statusFilter)
  }, [visits.data, statusFilter])

  async function changeStatus(v: Visit, status: VisitStatus) {
    try {
      await updateStatus.mutateAsync({ id: v.id, status })
      toast("success", `Visit ${status.toLowerCase()}.`)
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Couldn't update the visit.")
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Visits</h2>
        <p className="text-sm text-muted-foreground">
          Visit requests from tenants on your listings.
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
            {s === "ALL" ? "All" : s}
          </button>
        ))}
      </div>

      {visits.isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <CalendarCheck className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="font-medium">No visits yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              When tenants request a visit from a listing, it'll show up here.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((v) => (
            <Card key={v.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {v.tenant?.full_name ?? "Unknown tenant"}
                    {v.tenant?.primary_phone && (
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        {v.tenant.primary_phone}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {v.listing?.title ?? "Listing removed"} ·{" "}
                    {fmtDateTime(v.visit_date)}
                  </p>
                  {v.notes && (
                    <p className="mt-1 text-sm italic text-muted-foreground">
                      “{v.notes}”
                    </p>
                  )}
                </div>
                <Badge variant={statusVariant(v.status)}>{v.status}</Badge>
              </div>
              {(v.status === "REQUESTED" || v.status === "CONFIRMED") && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {v.status === "REQUESTED" && (
                    <Button
                      size="sm"
                      onClick={() => changeStatus(v, "CONFIRMED")}
                      disabled={updateStatus.isPending}
                    >
                      <CalendarCheck className="mr-1 h-3.5 w-3.5" /> Confirm
                    </Button>
                  )}
                  {v.status === "CONFIRMED" && (
                    <Button
                      size="sm"
                      onClick={() => changeStatus(v, "COMPLETED")}
                      disabled={updateStatus.isPending}
                    >
                      Mark completed
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => changeStatus(v, "CANCELLED")}
                    disabled={updateStatus.isPending}
                  >
                    <CalendarX className="mr-1 h-3.5 w-3.5" /> Cancel
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
