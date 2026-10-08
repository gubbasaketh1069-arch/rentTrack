import { useState } from "react"
import { Pencil, Plus, Trash2 } from "lucide-react"
import {
  useCreateFloor,
  useDeleteFloor,
  useUpdateFloor,
  type Floor,
} from "@/hooks/usePropertyData"
import { FLOOR_STRUCTURE_PRESETS } from "@/lib/constants"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ConfirmDialog, Dialog } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/toast"

/**
 * Floor CRUD for a property (spec section 6). Supports the standard
 * structures (G, G+1, G+2…) as one-tap presets plus fully custom names.
 * Deleting a floor keeps its flats — they become unassigned (floor_id set
 * null by the database) rather than being deleted.
 */
export default function FloorManager({
  propertyId,
  floors,
}: {
  propertyId: string
  floors: Floor[]
}) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [editing, setEditing] = useState<Floor | null>(null)
  const [deleting, setDeleting] = useState<Floor | null>(null)
  const [error, setError] = useState<string | null>(null)

  const createMutation = useCreateFloor(propertyId)
  const updateMutation = useUpdateFloor(propertyId)
  const deleteMutation = useDeleteFloor(propertyId)
  const busy =
    createMutation.isPending || updateMutation.isPending || deleteMutation.isPending

  function reset() {
    setName("")
    setEditing(null)
    setError(null)
  }

  async function handleSave() {
    setError(null)
    const trimmed = name.trim()
    if (!trimmed) {
      setError("Floor name is required.")
      return
    }
    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, name: trimmed })
        toast("success", "Floor renamed.")
      } else {
        const maxOrder = floors.reduce((m, f) => Math.max(m, f.sort_order), -1)
        await createMutation.mutateAsync({
          name: trimmed,
          sort_order: maxOrder + 1,
        })
        toast("success", `Floor "${trimmed}" added.`)
      }
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.")
    }
  }

  async function handlePreset(structure: string) {
    setError(null)
    const names = FLOOR_STRUCTURE_PRESETS[structure]
    const existing = new Set(floors.map((f) => f.name.toLowerCase()))
    const toAdd = names.filter((n) => !existing.has(n.toLowerCase()))
    if (toAdd.length === 0) {
      setError(`All floors of ${structure} already exist.`)
      return
    }
    try {
      const maxOrder = floors.reduce((m, f) => Math.max(m, f.sort_order), -1)
      for (let i = 0; i < toAdd.length; i++) {
        await createMutation.mutateAsync({
          name: toAdd[i],
          sort_order: maxOrder + 1 + i,
        })
      }
      toast("success", `Added floors: ${toAdd.join(", ")}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.")
    }
  }

  async function handleDelete() {
    if (!deleting) return
    try {
      await deleteMutation.mutateAsync(deleting.id)
      toast("success", `Floor "${deleting.name}" deleted.`)
      setDeleting(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.")
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Manage floors
      </Button>

      <Dialog
        open={open}
        onClose={() => {
          setOpen(false)
          reset()
        }}
        title="Floors"
        description="Standard structures or your own names — each floor can hold a different number of flats."
      >
        <div className="space-y-5">
          <div>
            <Label className="mb-2 block text-xs text-muted-foreground">
              Quick add a standard structure
            </Label>
            <div className="flex flex-wrap gap-2">
              {Object.keys(FLOOR_STRUCTURE_PRESETS).map((s) => (
                <Button
                  key={s}
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => handlePreset(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Input
              placeholder={editing ? "New floor name" : "Custom floor name, e.g. Terrace"}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  handleSave()
                }
              }}
              disabled={busy}
              aria-label="Floor name"
            />
            <Button onClick={handleSave} disabled={busy}>
              <Plus className="mr-1 h-4 w-4" />
              {editing ? "Save" : "Add"}
            </Button>
            {editing && (
              <Button variant="ghost" onClick={reset} disabled={busy}>
                Cancel
              </Button>
            )}
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <ul className="divide-y rounded-lg border">
            {floors.length === 0 && (
              <li className="p-4 text-sm text-muted-foreground">
                No floors yet. Add a structure above or a custom name.
              </li>
            )}
            {floors.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between gap-2 p-3"
              >
                <span className="text-sm font-medium">{f.name}</span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Rename ${f.name}`}
                    onClick={() => {
                      setEditing(f)
                      setName(f.name)
                      setError(null)
                    }}
                    disabled={busy}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${f.name}`}
                    onClick={() => setDeleting(f)}
                    disabled={busy}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title={`Delete floor "${deleting?.name}"?`}
        message="Flats on this floor are kept and become unassigned. The floor itself is removed permanently."
        confirming={deleteMutation.isPending}
      />
    </>
  )
}
