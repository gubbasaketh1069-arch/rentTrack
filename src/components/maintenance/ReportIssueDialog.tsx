import { useEffect, useState } from "react"
import { ImagePlus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/toast"
import {
  MAINTENANCE_CATEGORIES,
  useAddRequestPhotos,
  useCreateMaintenanceRequest,
} from "@/hooks/useMaintenanceData"

interface Props {
  open: boolean
  onClose: () => void
  tenantId: string | null
  propertyId: string
  flatId: string | null
  contextLabel: string
}

export default function ReportIssueDialog({
  open,
  onClose,
  tenantId,
  propertyId,
  flatId,
  contextLabel,
}: Props) {
  const { toast } = useToast()
  const createRequest = useCreateMaintenanceRequest()
  const addPhotos = useAddRequestPhotos()

  const [category, setCategory] = useState<string>(MAINTENANCE_CATEGORIES[0])
  const [description, setDescription] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setCategory(MAINTENANCE_CATEGORIES[0])
    setDescription("")
    setFiles([])
    setSaving(false)
  }, [open ])

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []).slice(0, 5)
    const images = picked.filter((f) => f.type.startsWith("image/"))
    if (images.length < picked.length) {
      toast("error", "Only image files are accepted.")
    }
    setFiles(images)
    e.target.value = ""
  }

  async function handleSubmit() {
    if (!description.trim()) {
      toast("error", "Please describe the issue.")
      return
    }
    setSaving(true)
    try {
      const req = await createRequest.mutateAsync({
        tenant_id: tenantId,
        property_id: propertyId,
        flat_id: flatId,
        category,
        description: description.trim(),
      })
      if (files.length > 0) {
        try {
          await addPhotos.mutateAsync({
            requestId: req.id,
            propertyId,
            files,
          })
        } catch (e) {
          // The request itself exists; the photo failure is reported honestly.
          toast(
            "error",
            `Issue reported, but photos failed: ${e instanceof Error ? e.message : "upload error"}`
          )
          onClose()
          return
        }
      }
      toast("success", "Issue reported.")
      onClose()
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Could not report the issue.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Report an issue"
      description={contextLabel}
    >
      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="issue-category">Category</Label>
          <select
            id="issue-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
          >
            {MAINTENANCE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="issue-description">What's wrong?</Label>
          <textarea
            id="issue-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="e.g. Bathroom tap is leaking continuously since yesterday…"
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="issue-photos">Photos (optional, up to 5)</Label>
          <Input
            id="issue-photos"
            type="file"
            accept="image/*"
            multiple
            onChange={handleFiles}
          />
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <span
                  key={`${f.name}-${i}`}
                  className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs"
                >
                  <ImagePlus className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="max-w-32 truncate">{f.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${f.name}`}
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    className="rounded p-0.5 hover:bg-accent"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Reporting…" : "Report issue"}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
