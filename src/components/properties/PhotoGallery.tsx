import { useState } from "react"
import { Building2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { propertyPhotoUrl } from "@/lib/propertyPhotos"

interface PhotoGalleryProps {
  /** Ordered storage paths (first = cover). */
  paths: string[]
  /** Small caption shown under the gallery, e.g. "Property photos". */
  caption?: string
}

/**
 * Photo gallery: large cover + clickable thumbnails (Uber-style rounded-2xl).
 * Renders nothing when there are no photos — callers decide on fallbacks.
 */
export default function PhotoGallery({ paths, caption }: PhotoGalleryProps) {
  const [coverIndex, setCoverIndex] = useState(0)
  if (paths.length === 0) return null
  const cover = paths[Math.min(coverIndex, paths.length - 1)]

  return (
    <div className="space-y-2">
      <img
        src={propertyPhotoUrl(cover)}
        alt=""
        className="h-64 w-full rounded-2xl object-cover"
      />
      {paths.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {paths.map((path, i) => (
            <button
              key={path}
              type="button"
              onClick={() => setCoverIndex(i)}
              aria-label={`Show photo ${i + 1}`}
              className={cn(
                "shrink-0 overflow-hidden rounded-xl ring-offset-2",
                i === coverIndex && "ring-2 ring-black"
              )}
            >
              <img
                src={propertyPhotoUrl(path)}
                alt=""
                className="h-16 w-16 object-cover"
              />
            </button>
          ))}
        </div>
      )}
      {caption && (
        <p className="text-xs text-muted-foreground">{caption}</p>
      )}
    </div>
  )
}

/** Honest neutral placeholder used when no real photo exists anywhere. */
export function PhotoPlaceholder({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center bg-[#F0F0F0] text-neutral-400",
        className
      )}
      aria-hidden
    >
      <Building2 className="h-10 w-10" />
    </div>
  )
}
