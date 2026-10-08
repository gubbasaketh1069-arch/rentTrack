import { useEffect, useState } from "react"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { useAddReading, type Meter } from "@/hooks/useMeterData"

interface ReadingDialogProps {
  open: boolean
  onClose: () => void
  meter: Meter
  previousReading: number | null
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function ReadingDialog({
  open,
  onClose,
  meter,
  previousReading,
}: ReadingDialogProps) {
  const { toast } = useToast()
  const [readingDate, setReadingDate] = useState(todayISO())
  const [current, setCurrent] = useState("")
  const [error, setError] = useState<string | null>(null)

  const addMutation = useAddReading()

  useEffect(() => {
    if (!open) return
    setReadingDate(todayISO())
    setCurrent("")
    setError(null)
  }, [open ])

  const currentNum = Number(current)
  const validCurrent = current.trim() !== "" && Number.isFinite(currentNum)
  const units =
    validCurrent && previousReading != null
      ? currentNum - previousReading
      : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!validCurrent || currentNum < 0) {
      setError("Enter a valid reading (0 or more).")
      return
    }
    try {
      await addMutation.mutateAsync({
        meterId: meter.id,
        readingDate,
        currentReading: currentNum,
      })
      toast("success", "Reading recorded.")
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong."
      setError(message)
      toast("error", message)
    }
  }

  const saving = addMutation.isPending

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add meter reading"
      description={`${meter.type === "ELECTRICITY" ? "Electricity" : "Bore"} meter ${meter.meter_number || "—"}. Units are computed automatically.`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="reading-date">Reading date</Label>
            <Input
              id="reading-date"
              type="date"
              value={readingDate}
              onChange={(e) => setReadingDate(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reading-prev">Previous reading</Label>
            <Input
              id="reading-prev"
              value={previousReading != null ? String(previousReading) : "0 (first reading)"}
              disabled
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="reading-current">
              Current reading <span className="text-destructive">*</span>
            </Label>
            <Input
              id="reading-current"
              type="number"
              min="0"
              step="0.01"
              placeholder="0"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reading-units">Units used</Label>
            <Input
              id="reading-units"
              value={units != null ? String(units) : "—"}
              disabled
            />
          </div>
        </div>
        {units != null && units < 0 && (
          <p className="text-sm text-destructive" role="alert">
            Current reading can't be less than the previous reading.
          </p>
        )}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || (units != null && units < 0)}>
            {saving ? "Saving…" : "Save reading"}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
