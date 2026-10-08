import { useEffect, useState } from "react"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import {
  useReplaceMeter,
  type Meter,
  type MeterInput,
} from "@/hooks/useMeterData"

interface ReplaceMeterDialogProps {
  open: boolean
  onClose: () => void
  flatId: string
  propertyId: string | null
  flatNumber: string
  oldMeter: Meter
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function ReplaceMeterDialog({
  open,
  onClose,
  flatId,
  propertyId,
  flatNumber,
  oldMeter,
}: ReplaceMeterDialogProps) {
  const { toast } = useToast()
  const typeLabel = oldMeter.type === "ELECTRICITY" ? "Electricity" : "Bore"

  const [meterNumber, setMeterNumber] = useState("")
  const [usc, setUsc] = useState("")
  const [serialNumber, setSerialNumber] = useState("")
  const [swapDate, setSwapDate] = useState(todayISO())
  const [error, setError] = useState<string | null>(null)

  const replaceMutation = useReplaceMeter(flatId)

  useEffect(() => {
    if (!open) return
    setMeterNumber("")
    setUsc("")
    setSerialNumber("")
    setSwapDate(todayISO())
    setError(null)
  }, [open ])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!swapDate) {
      setError("Choose the date the new meter takes over.")
      return
    }
    const input: MeterInput = {
      flat_id: flatId,
      property_id: propertyId,
      type: oldMeter.type,
      meter_number: meterNumber.trim() || null,
      usc: usc.trim() || null,
      serial_number: serialNumber.trim() || null,
      start_date: swapDate,
    }
    try {
      await replaceMutation.mutateAsync({ oldMeter, input, endDate: swapDate })
      toast(
        "success",
        `Meter replaced. The old meter stays in history with end date ${swapDate}.`
      )
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong."
      setError(message)
      toast("error", message)
    }
  }

  const saving = replaceMutation.isPending

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Replace ${typeLabel.toLowerCase()} meter`}
      description={`Flat ${flatNumber}. The old meter (${oldMeter.meter_number || "unnumbered"}) is kept in history — it is never deleted.`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="replace-date">
            Swap date <span className="text-destructive">*</span>
          </Label>
          <Input
            id="replace-date"
            type="date"
            value={swapDate}
            onChange={(e) => setSwapDate(e.target.value)}
            required
          />
          <p className="text-xs text-muted-foreground">
            The old meter's history ends on this date; the new meter starts on it.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="replace-number">New meter number</Label>
            <Input
              id="replace-number"
              placeholder="MTR-20981"
              value={meterNumber}
              onChange={(e) => setMeterNumber(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="replace-usc">New USC</Label>
            <Input
              id="replace-usc"
              value={usc}
              onChange={(e) => setUsc(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="replace-serial">New serial number</Label>
          <Input
            id="replace-serial"
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
          />
        </div>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Replacing…" : "Replace meter"}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
