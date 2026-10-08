import { useEffect, useMemo, useRef, useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Loader2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { deletePhotoObjects, propertyPhotoUrl } from "@/lib/propertyPhotos"
import { useToast } from "@/components/ui/toast"

const MAX_FILES = 10
const MAX_SIZE_MB = 5

interface PhotoUploaderProps {
  label?: string
  /** Committed storage paths, ordered — first entry is the cover. */
  paths: string[]
  onPathsChange: (paths: string[]) => void
  /**
   * Files picked but not yet uploaded. They are staged locally (with
   * previews) and the parent uploads them when the form is submitted —
   * cancelling the form therefore never leaves orphaned storage objects.
   */
  pending: File[]
  onPendingChange: (files: File[]) => void
  disabled?: boolean
}

/**
 * Multi-photo picker with previews, remove and reorder (Uber-style:
 * rounded-2xl thumbs, black pill button). Removing a committed photo deletes
 * its storage object first, so no orphaned files remain.
 */
export default function PhotoUploader({
  label = "Photos",
  paths,
  onPathsChange,
  pending,
  onPendingChange,
  disabled,
}: PhotoUploaderProps) {
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [removingIndex, setRemovingIndex] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const pendingUrls = useMemo(
    () => pending.map((f) => URL.createObjectURL(f)),
    [pending]
  )
  useEffect(() => {
    return () => {
      pendingUrls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [pendingUrls])

  function pickableCount(): number {
    return Math.max(0, MAX_FILES - paths.length - pending.length)
  }

  function handlePicked(files: FileList | null) {
    if (!files) return
    setError(null)
    const imgs = Array.from(files).filter((f) => f.type.startsWith("image/"))
    const tooBig = imgs.filter((f) => f.size > MAX_SIZE_MB * 1024 * 1024)
    if (tooBig.length > 0) {
      setError(`Each photo must be under ${MAX_SIZE_MB} MB.`)
      return
    }
    const allowed = imgs.slice(0, pickableCount())
    if (allowed.length < imgs.length) {
      setError(`You can add up to ${MAX_FILES} photos.`)
    }
    if (allowed.length === 0) return
    onPendingChange([...pending, ...allowed])
    if (inputRef.current) inputRef.current.value = ""
  }

  async function removePath(index: number) {
    const path = paths[index]
    setRemovingIndex(index)
    setError(null)
    try {
      // Storage object first — a failure leaves the row untouched, no orphans.
      await deletePhotoObjects([path])
      onPathsChange(paths.filter((_, i) => i !== index))
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Couldn't delete the photo."
      setError(message)
      toast("error", message)
    } finally {
      setRemovingIndex(null)
    }
  }

  function removePending(index: number) {
    URL.revokeObjectURL(pendingUrls[index])
    onPendingChange(pending.filter((_, i) => i !== index))
  }

  function move(index: number, dir: -1 | 1) {
    const next = [...paths]
    const j = index + dir
    if (j < 0 || j >= next.length) return
    ;[next[index], next[j]] = [next[j], next[index]]
    onPathsChange(next)
  }

  const busy = disabled || removingIndex !== null

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium">{label}</p>
        {paths.length + pending.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            First photo is the cover · uploads when you save
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Tenants see these on Find-a-Flat
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {paths.map((path, i) => (
          <div key={path} className="relative">
            <img
              src={propertyPhotoUrl(path)}
              alt=""
              className="h-20 w-20 rounded-2xl object-cover"
            />
            {i === 0 && (
              <span className="absolute left-1 top-1 rounded-full bg-black px-2 py-0.5 text-[10px] font-semibold text-white">
                Cover
              </span>
            )}
            <div className="absolute -bottom-2 left-1/2 flex -translate-x-1/2 gap-0.5">
              <button
                type="button"
                aria-label="Move photo left"
                disabled={busy || i === 0}
                onClick={() => move(i, -1)}
                className="rounded-full bg-black/80 p-0.5 text-white disabled:opacity-30"
              >
                <ChevronLeft className="h-3 w-3" />
              </button>
              <button
                type="button"
                aria-label="Move photo right"
                disabled={busy || i === paths.length - 1}
                onClick={() => move(i, 1)}
                className="rounded-full bg-black/80 p-0.5 text-white disabled:opacity-30"
              >
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>
            <button
              type="button"
              aria-label="Remove photo"
              disabled={busy}
              onClick={() => void removePath(i)}
              className="absolute -right-1.5 -top-1.5 rounded-full bg-black p-1 text-white"
            >
              {removingIndex === i ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <X className="h-3 w-3" />
              )}
            </button>
          </div>
        ))}

        {pending.map((file, i) => (
          <div key={`${file.name}-${i}`} className="relative">
            <img
              src={pendingUrls[i]}
              alt=""
              className="h-20 w-20 rounded-2xl object-cover opacity-80"
            />
            <span className="absolute left-1 top-1 rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold text-white">
              New
            </span>
            <button
              type="button"
              aria-label="Remove photo"
              disabled={busy}
              onClick={() => removePending(i)}
              className="absolute -right-1.5 -top-1.5 rounded-full bg-black p-1 text-white"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        disabled={busy}
        onChange={(e) => handlePicked(e.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy || pickableCount() === 0}
        onClick={() => inputRef.current?.click()}
      >
        <ImagePlus className="mr-1 h-3.5 w-3.5" />
        Add photos
      </Button>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
