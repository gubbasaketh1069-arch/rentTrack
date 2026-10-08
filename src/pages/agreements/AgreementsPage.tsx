import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { ExternalLink, FileText, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import GenerateAgreementButton from "@/components/agreements/GenerateAgreementButton"
import {
  daysUntilExpiry,
  expiryBucket,
  getAgreementSignedUrl,
  useAgreements,
  useDeleteAgreement,
  useEnsureExpiryNotifications,
  type RentalAgreement,
} from "@/hooks/useAgreementData"
import { useMyProperties } from "@/hooks/usePropertyData"
import AgreementDialog from "@/components/agreements/AgreementDialog"
import { cn } from "@/lib/utils"

function expiryBadge(days: number | null) {
  const bucket = expiryBucket(days)
  if (bucket === "expired")
    return { variant: "due" as const, label: `Expired ${-days!}d ago` }
  if (bucket === "7") return { variant: "due" as const, label: `${days}d left` }
  if (bucket === "15" || bucket === "30")
    return { variant: "partial" as const, label: `${days}d left` }
  if (bucket === "60") return { variant: "info" as const, label: `${days}d left` }
  return { variant: "neutral" as const, label: days === null ? "No end date" : `${days}d left` }
}

function AgreementRow({
  agreement,
  onEdit,
  onDelete,
}: {
  agreement: RentalAgreement
  onEdit: () => void
  onDelete: () => void
}) {
  const { toast } = useToast()
  const [opening, setOpening] = useState(false)
  const days = daysUntilExpiry(agreement.end_date)
  const badge = expiryBadge(days)

  async function openDocument() {
    if (!agreement.document_path) return
    setOpening(true)
    try {
      const url = await getAgreementSignedUrl(agreement.document_path)
      window.open(url, "_blank", "noopener,noreferrer")
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Could not open document.")
    } finally {
      setOpening(false)
    }
  }

  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{agreement.tenant_name ?? "Unknown tenant"}</p>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {agreement.property_name ?? ""}
            {agreement.flat_number ? ` · Flat ${agreement.flat_number}` : ""}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {agreement.start_date
              ? format(new Date(agreement.start_date + "T00:00:00"), "d MMM yyyy")
              : "—"}{" "}
            →{" "}
            {agreement.end_date
              ? format(new Date(agreement.end_date + "T00:00:00"), "d MMM yyyy")
              : "No end date"}
          </p>
          {agreement.notes && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {agreement.notes}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          {agreement.document_path && (
            <button
              type="button"
              aria-label="Open agreement document"
              onClick={openDocument}
              disabled={opening}
              className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
            >
              {opening ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
            </button>
          )}
          <button
            type="button"
            aria-label="Edit agreement"
            onClick={onEdit}
            className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <GenerateAgreementButton agreement={agreement} />
          <button
            type="button"
            aria-label="Delete agreement"
            onClick={onDelete}
            className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </CardContent>
    </Card>
  )
}

const URGENCY_ORDER = ["expired", "7", "15", "30", "60"] as const
const URGENCY_TITLES: Record<string, string> = {
  expired: "Already expired",
  "7": "Expiring within 7 days",
  "15": "Expiring within 15 days",
  "30": "Expiring within 30 days",
  "60": "Expiring within 60 days",
}

export default function AgreementsPage() {
  const { toast } = useToast()
  const properties = useMyProperties()
  const [propertyId, setPropertyId] = useState("")
  const agreements = useAgreements(propertyId || undefined)
  const deleteAgreement = useDeleteAgreement()
  const ensureNotifications = useEnsureExpiryNotifications()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<RentalAgreement | null>(null)
  const [deleting, setDeleting] = useState<RentalAgreement | null>(null)

  const expiringGroups = useMemo(() => {
    const groups = new Map<string, RentalAgreement[]>()
    for (const a of agreements.data ?? []) {
      const bucket = expiryBucket(daysUntilExpiry(a.end_date))
      if (!bucket) continue
      if (!groups.has(bucket)) groups.set(bucket, [])
      groups.get(bucket)!.push(a)
    }
    return URGENCY_ORDER.filter((b) => groups.has(b)).map((b) => ({
      bucket: b,
      items: groups.get(b)!,
    }))
  }, [agreements.data])

  // Feed expiry reminders into the notifications table (deduped, owner only).
  // Runs when the agreement list loads — writing real rows, not fake pushes.
  const [notifiedFor, setNotifiedFor] = useState<string>("")
  useEffect(() => {
    const data = agreements.data
    if (!data || agreements.isLoading || ensureNotifications.isPending) return
    const key = data.map((a) => a.id).join(",")
    if (key === notifiedFor) return
    setNotifiedFor(key)
    ensureNotifications.mutate(data, {
      onSuccess: (created) => {
        if (created > 0) {
          toast("success", `${created} expiry reminder${created === 1 ? "" : "s"} added to your notifications.`)
        }
      },
      onError: (e) => {
        // Non-fatal: the agreements themselves are all visible regardless.
        toast("error", `Could not write expiry reminders: ${e.message}`)
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agreements.data, agreements.isLoading])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Agreements</h1>
          <p className="text-sm text-muted-foreground">
            Rental agreements per tenancy, stored privately.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
          disabled={(properties.data ?? []).length === 0}
          title={
            (properties.data ?? []).length === 0
              ? "Add a property first"
              : "New rental agreement"
          }
        >
          <Plus className="mr-1.5 h-4 w-4" /> New agreement
        </Button>
      </div>

      {expiringGroups.length > 0 && (
        <Card className={cn("border-status-due/40")}>
          <CardHeader>
            <CardTitle className="text-base">Expiring soon</CardTitle>
            <CardDescription>
              Agreements at or past the 60 / 30 / 15 / 7-day marks. Reminders
              are also written to your notifications.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {expiringGroups.map((g) => (
              <div key={g.bucket}>
                <p className="mb-2 text-sm font-semibold text-status-due">
                  {URGENCY_TITLES[g.bucket]} ({g.items.length})
                </p>
                <div className="grid gap-2">
                  {g.items.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{a.tenant_name ?? "Tenant"}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          · {a.property_name ?? ""}
                          {a.flat_number ? ` · Flat ${a.flat_number}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {a.end_date
                          ? format(new Date(a.end_date + "T00:00:00"), "d MMM yyyy")
                          : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid max-w-xs gap-1.5">
        <Label htmlFor="agr-property-filter">Property</Label>
        <select
          id="agr-property-filter"
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

      {agreements.isLoading ? (
        <div className="grid gap-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : agreements.error ? (
        <p className="text-sm text-destructive" role="alert">
          Couldn't load agreements: {(agreements.error as Error).message}
        </p>
      ) : (agreements.data ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No agreements yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Save a rental agreement against a tenancy — upload the signed
              document and get reminded before it expires.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {agreements.data!.map((a) => (
            <AgreementRow
              key={a.id}
              agreement={a}
              onEdit={() => {
                setEditing(a)
                setDialogOpen(true)
              }}
              onDelete={() => setDeleting(a)}
            />
          ))}
        </div>
      )}

      <AgreementDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        editing={editing}
      />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete agreement?"
        message="The agreement record and its document will be permanently removed. Tenancy history is kept."
        confirming={deleteAgreement.isPending}
        onConfirm={async () => {
          if (!deleting) return
          try {
            await deleteAgreement.mutateAsync(deleting)
            toast("success", "Agreement deleted.")
            setDeleting(null)
          } catch (e) {
            toast("error", e instanceof Error ? e.message : "Could not delete agreement.")
          }
        }}
      />
    </div>
  )
}
