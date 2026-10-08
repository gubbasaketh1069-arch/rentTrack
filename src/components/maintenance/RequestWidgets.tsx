import { useState } from "react"
import { ExternalLink, Images, Loader2 } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import {
  getMaintenancePhotoUrl,
  statusLabel,
  useRequestHistory,
  useRequestPhotos,
  type MaintenanceStatus,
} from "@/hooks/useMaintenanceData"

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function RequestPhotos({ requestId }: { requestId: string }) {
  const { toast } = useToast()
  const photos = useRequestPhotos(requestId)
  const [opening, setOpening] = useState<string | null>(null)

  if (photos.isLoading) return <Skeleton className="h-16" />
  if (photos.error) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Couldn't load photos: {(photos.error as Error).message}
      </p>
    )
  }
  if ((photos.data ?? []).length === 0) return null

  async function openPhoto(photoId: string, path: string) {
    setOpening(photoId)
    try {
      const url = await getMaintenancePhotoUrl(path)
      window.open(url, "_blank", "noopener,noreferrer")
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Could not open photo.")
    } finally {
      setOpening(null)
    }
  }

  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
        <Images className="h-4 w-4 text-muted-foreground" />
        Photos ({photos.data!.length})
      </p>
      <div className="flex flex-wrap gap-2">
        {photos.data!.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => openPhoto(p.id, p.storage_path)}
            disabled={opening === p.id}
            className="inline-flex max-w-48 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium shadow-sm hover:bg-accent disabled:opacity-50"
            title={p.file_name ?? "Photo"}
          >
            {opening === p.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            ) : (
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span className="truncate">{p.file_name ?? "Photo"}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function RequestTimeline({
  requestId,
  createdAt,
}: {
  requestId: string
  createdAt: string
}) {
  const history = useRequestHistory(requestId)

  if (history.isLoading) return <Skeleton className="h-24" />
  if (history.error) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Couldn't load timeline: {(history.error as Error).message}
      </p>
    )
  }

  const entries = history.data ?? []
  return (
    <div>
      <p className="mb-3 text-sm font-medium">Timeline</p>
      <ol className="relative space-y-4 border-l-2 border-muted pl-5">
        <li className="relative">
          <span className="absolute -left-[27px] top-1 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-primary/15" />
          <p className="text-sm font-medium">Reported</p>
          <p className="text-xs text-muted-foreground">{formatDateTime(createdAt)}</p>
        </li>
        {entries
          .filter((e) => e.from_status !== null)
          .map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute -left-[27px] top-1 h-2.5 w-2.5 rounded-full bg-muted-foreground/60 ring-4 ring-muted" />
              <p className="text-sm font-medium">
                {statusLabel(e.from_status as MaintenanceStatus)} →{" "}
                {statusLabel(e.to_status as MaintenanceStatus)}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(e.created_at)}
              </p>
            </li>
          ))}
      </ol>
    </div>
  )
}
