import { useState } from "react"
import { format } from "date-fns"
import { ExternalLink, FileText, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import TenantGate from "@/components/portal/TenantGate"
import {
  daysUntilExpiry,
  expiryBucket,
  getAgreementSignedUrl,
  useMyAgreement,
} from "@/hooks/useAgreementData"

function expiryNote(days: number | null): string | null {
  const bucket = expiryBucket(days)
  if (bucket === "expired") return `This agreement expired ${-days!} day${-days! === 1 ? "" : "s"} ago. Contact your owner about renewal.`
  if (bucket === "7") return `Expiring in ${days} days — talk to your owner about renewal soon.`
  if (bucket === "15" || bucket === "30" || bucket === "60")
    return `Expiring in ${days} days.`
  return null
}

export default function TenantAgreementPage() {
  return (
    <TenantGate>
      {({ tenant }) => <AgreementBody tenantId={tenant.id} />}
    </TenantGate>
  )
}

function AgreementBody({ tenantId }: { tenantId: string }) {
  const { toast } = useToast()
  const agreement = useMyAgreement(tenantId)
  const [opening, setOpening] = useState(false)

  if (agreement.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40" />
      </div>
    )
  }

  if (agreement.error) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Couldn't load your agreement: {(agreement.error as Error).message}
      </p>
    )
  }

  const a = agreement.data
  if (!a) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Agreement</h2>
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No agreement on file</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Your owner hasn't added a rental agreement for your tenancy yet.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const days = daysUntilExpiry(a.end_date)
  const note = expiryNote(days)

  async function openDocument() {
    const path = agreement.data?.document_path
    if (!path) return
    setOpening(true)
    try {
      const url = await getAgreementSignedUrl(path)
      window.open(url, "_blank", "noopener,noreferrer")
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Could not open document.")
    } finally {
      setOpening(false)
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Agreement</h2>
      <Card>
        <CardContent className="grid gap-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={days !== null && days <= 30 ? "partial" : "info"}>
              {a.property_name ?? ""}
              {a.flat_number ? ` · Flat ${a.flat_number}` : ""}
            </Badge>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Start date</dt>
              <dd className="font-medium">
                {a.start_date
                  ? format(new Date(a.start_date + "T00:00:00"), "d MMM yyyy")
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">End date</dt>
              <dd className="font-medium">
                {a.end_date
                  ? format(new Date(a.end_date + "T00:00:00"), "d MMM yyyy")
                  : "—"}
              </dd>
            </div>
          </dl>
          {note && (
            <p className="rounded-lg bg-status-partial/10 px-3 py-2 text-sm text-status-partial">
              {note}
            </p>
          )}
          {a.notes && <p className="text-sm text-muted-foreground">{a.notes}</p>}
          {a.document_path ? (
            <Button
              variant="outline"
              onClick={openDocument}
              disabled={opening}
              className="w-fit"
            >
              {opening ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="mr-2 h-4 w-4" />
              )}
              View agreement document
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              No document attached to this agreement.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
