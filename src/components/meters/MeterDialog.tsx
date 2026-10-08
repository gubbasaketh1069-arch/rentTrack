import { useEffect, useState } from "react"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import {
  useCreateMeter,
  useUpdateMeter,
  type Meter,
  type MeterInput,
  type MeterType,
} from "@/hooks/useMeterData"

interface MeterDialogProps {
  open: boolean
  onClose: () => void
  flatId: string
  propertyId: string | null
  flatNumber: string
  type: MeterType
  meter?: Meter | null
}

function typeLabel(t: MeterType): string {
  return t === "ELECTRICITY" ? "Electricity" : "Bore"
}

export default function MeterDialog({
  open,
  onClose,
  flatId,
  propertyId,
  flatNumber,
  type,
  meter,
}: MeterDialogProps) {
  const { toast } = useToast()
  const isEdit = !!meter

  const [meterNumber, setMeterNumber] = useState(meter?.meter_number ?? "")
  const [usc, setUsc] = useState(meter?.usc ?? "")
  const [serialNumber, setSerialNumber] = useState(meter?.serial_number ?? "")
  const [startDate, setStartDate] = useState(meter?.start_date ?? "")
  const [error, setError] = useState<string | null>(null)

  const createMutation = useCreateMeter(flatId)
  const updateMutation = useUpdateMeter(flatId)

  useEffect(() => {
    if (!open) return
    setMeterNumber(meter?.meter_number ?? "")
    setUsc(meter?.usc ?? "")
    setSerialNumber(meter?.serial_number ?? "")
    setStartDate(meter?.start_date ?? "")
    setError(null)
  }, [open, meter])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const payload: MeterInput = {
      flat_id: flatId,
      property_id: propertyId,
      type,
      meter_number: meterNumber.trim() || null,
      usc: usc.trim() || null,
      serial_number: serialNumber.trim() || null,
      start_date: startDate || null,
    }
    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ id: meter.id, input: payload })
        toast("success", `${typeLabel(type)} meter updated.`)
      } else {
        await createMutation.mutateAsync(payload)
        toast("success", `${typeLabel(type)} meter added for flat ${flatNumber}.`)
      }
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong."
      setError(message)
      toast("error", message)
    }
  }

  const saving = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit ${typeLabel(type).toLowerCase()} meter` : `Add ${typeLabel(type).toLowerCase()} meter`}
      description={`Flat ${flatNumber}. Combined in bills as "meter / USC" — no separate columns.`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="meter-number">Meter number</Label>
            <Input
              id="meter-number"
              placeholder="MTR-10245"
              value={meterNumber}
              onChange={(e) => setMeterNumber(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="meter-usc">USC</Label>
            <Input
              id="meter-usc"
              placeholder="123456"
              value={usc}
              onChange={(e) => setUsc(e.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="meter-serial">Serial number</Label>
            <Input
              id="meter-serial"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="meter-start">Start date</Label>
            <Input
              id="meter-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
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
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add meter"}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
