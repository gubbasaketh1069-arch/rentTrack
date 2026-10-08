import { FileText } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import TenantGate from "@/components/portal/TenantGate"
import { useMyDocuments } from "@/hooks/useTenantPortal"

const DOC_LABELS: Record<string, string> = {
  AADHAAR_FRONT: "Aadhaar (front)",
  AADHAAR_BACK: "Aadhaar (back)",
  RENTAL_AGREEMENT: "Rental agreement",
  PHOTO: "Photo",
  OTHER: "Document",
}

function DocumentsBody({ tenantId }: { tenantId: string }) {
  const docs = useMyDocuments(tenantId)

  if (docs.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    )
  }

  if (docs.error) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Couldn't load documents: {(docs.error as Error).message}
      </p>
    )
  }

  const list = docs.data ?? []

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Documents</h2>
      {list.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <FileText className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="max-w-sm text-sm text-muted-foreground">
              No documents on file yet. Your owner adds identity documents and
              agreements here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {list.map((d) => (
            <Card key={d.id}>
              <CardContent className="flex items-center gap-3 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {DOC_LABELS[d.doc_type] ?? d.doc_type}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {d.file_name ?? "file"}
                    {d.family_member_name ? ` · ${d.family_member_name}` : " · You"}
                    {` · ${d.created_at.slice(0, 10)}`}
                  </p>
                </div>
                <Badge variant="neutral">Private</Badge>
              </CardContent>
            </Card>
          ))}
          <p className="text-xs text-muted-foreground">
            Documents are stored securely and only visible to you and your owner.
          </p>
        </div>
      )}
    </div>
  )
}

/** Tenant's own documents, list-only (spec section 32). */
export default function TenantDocumentsPage() {
  return (
    <TenantGate>
      {({ tenant }) => <DocumentsBody tenantId={tenant.id} />}
    </TenantGate>
  )
}
