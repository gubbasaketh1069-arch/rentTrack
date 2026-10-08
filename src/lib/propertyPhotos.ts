import { supabase } from "@/lib/supabase"

/**
 * Property + flat photos (feature: photo uploads, migration 010).
 *
 * Storage reuses the existing PUBLIC 'property-images' bucket (migration
 * 003) — the same public-read pattern as listing photos. Paths always start
 * with the property UUID so the existing storage policies (property-team
 * write/delete) apply unchanged:
 *   Property: <property_id>/<uuid>.<ext>
 *   Flat:     <property_id>/flats/<flat_id>/<uuid>.<ext>
 */

const BUCKET = "property-images"

/** Public URL for a property/flat photo storage path. */
export function propertyPhotoUrl(path: string): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

function extOf(file: File): string {
  const raw = file.name.split(".").pop()?.toLowerCase() ?? "jpg"
  const clean = raw.replace(/[^a-z0-9]/g, "")
  return clean || "jpg"
}

async function uploadTo(path: string, file: File): Promise<string> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || `image/${extOf(file)}`,
    upsert: false,
  })
  if (error) throw new Error(error.message)
  return path
}

/** Upload one property photo; returns the storage path. */
export async function uploadPropertyPhoto(
  propertyId: string,
  file: File
): Promise<string> {
  return uploadTo(`${propertyId}/${crypto.randomUUID()}.${extOf(file)}`, file)
}

/** Upload one flat photo; returns the storage path. */
export async function uploadFlatPhoto(
  propertyId: string,
  flatId: string,
  file: File
): Promise<string> {
  return uploadTo(
    `${propertyId}/flats/${flatId}/${crypto.randomUUID()}.${extOf(file)}`,
    file
  )
}

/**
 * Delete storage objects. Call BEFORE removing the paths from the row so a
 * failure never leaves orphaned files behind.
 */
export async function deletePhotoObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  const { error } = await supabase.storage.from(BUCKET).remove(paths)
  if (error) throw new Error(error.message)
}

/** First path of an ordered photo list, or null when empty. */
export function firstPhoto(paths: string[] | null | undefined): string | null {
  return paths && paths.length > 0 ? paths[0] : null
}
