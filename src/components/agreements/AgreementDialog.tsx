import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { FileUp, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/toast"
import { supabase } from "@/lib/supabase"
import {
  deleteAgreementFile,
  uploadAgreementDocument,
  useCreateAgreement,
  useUpdateAgreement,
  type RentalAgreement,
} from "@/hooks/useAgreementData"
import { useMyProperties } from "@/hooks/usePropertyData"

export interface TenancyOption {
  id: string
  flat_id: string | null
  tenant_name: string
  flat_number: string | null
  start_date: string
}

function useTenancyOptions(propertyId: string) {
  return useQuery({
    queryKey: ["agreement-tenancy-options", propertyId],
    queryFn: async (): Promise<TenancyOption[]> => {
      const { data, error } = await supabase
        .from("tenancies")
        .select("id, flat_id, start_date, tenant:tenants(full_name), flat:flats(flat_number)")
        .eq("property_id", propertyId)
        .eq("status", "ACTIVE")
        .order("start_date", { ascending: false })
      if (error) throw new Error(error.message)
      interface Raw {
        id: string
        flat_id: string | null
        start_date: string
        tenant: { full_name: string } | Array<{ full_name: string }> | null
        flat: { flat_number: string } | Array<{ flat_number: string }> | null
      }
      return ((data ?? []) as unknown as Raw[]).map((r) => {
        const tenant = Array.isArray(r.tenant) ? r.tenant[0] : r.tenant
        const flat = Array.isArray(r.flat) ? r.flat[0] : r.flat
        return {
          id: r.id,
          flat_id: r.flat_id,
          tenant_name: tenant?.full_name ?? "Unknown tenant",
          flat_number: flat?.flat_number ?? null,
          start_date: r.start_date,
        }
      })
    },
    enabled: !!propertyId,
  })
}

interface Props {
  open: boolean
  onClose: () => void
  editing: RentalAgreement | null
}

export default function AgreementDialog({ open, onClose, editing }: Props) {
  const { toast } = useToast()
  const properties = useMyProperties()
  const createAgreement = useCreateAgreement()
  const updateAgreement = useUpdateAgreement()

  const [propertyId, setPropertyId] = useState("")
  const [tenancyId, setTenancyId] = useState("")
  const [flatId, setFlatId] = useState<string | null>(null)
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [notes, setNotes] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [removeDoc, setRemoveDoc] = useState(false)

  const tenancies = useTenancyOptions(propertyId)

  useEffect(() => {
    if (!open) return
    setPropertyId(editing?.property_id ?? "")
    setTenancyId(editing?.tenancy_id ?? "")
    setFlatId(editing?.flat_id ?? null)
    setStartDate(editing?.start_date ?? "")
    setEndDate(editing?.end_date ?? "")
    setNotes(editing?.notes ?? "")
    setFile(null)
    setRemoveDoc(false)
  }, [open, editing])

  // When the tenancy changes, default the flat + dates from it.
  useEffect(() => {
    if (editing) return
    const t = (tenancies.data ?? []).find((x) => x.id === tenancyId)
    if (t) {
      setFlatId(t.flat_id)
      if (!startDate) setStartDate(t.start_date)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenancyId, tenancies.data])

  const saving = createAgreement.isPending || updateAgreement.isPending

  async function handleSave() {
    if (!propertyId) {
      toast("error", "Choose a property.")
      return
    }
    if (!tenancyId) {
      toast("error", "Choose a tenancy.")
      return
    }
    if (startDate && endDate && endDate < startDate) {
      toast("error", "End date can't be before the start date.")
      return
    }
    try {
      const oldPath = editing?.document_path ?? null
      let documentPath = oldPath
      if (file) {
        documentPath = await uploadAgreementDocument(propertyId, file)
      } else if (removeDoc) {
        documentPath = null
      }
      const input = {
        tenancy_id: tenancyId,
        property_id: propertyId,
        flat_id: flatId,
        start_date: startDate || null,
        end_date: endDate || null,
        notes: notes.trim() || null,
        documentPath,
      }
      if (editing) {
        await updateAgreement.mutateAsync({ id: editing.id, ...input })
        // Clean up the replaced/removed file (best effort — DB is source of truth).
        if (oldPath && oldPath !== documentPath) {
          await deleteAgreementFile(oldPath).catch(() => {})
        }
        toast("success", "Agreement updated.")
      } else {
        await createAgreement.mutateAsync(input)
        toast("success", "Agreement saved.")
      }
      onClose()
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Could not save the agreement.")
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title={editing ? "Edit agreement" : "New rental agreement"}
      description="Stored privately — only you and the tenant can see it."
    >
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="agr-property">Property *</Label>
            <select
              id="agr-property"
              value={propertyId}
              onChange={(e) => {
                setPropertyId(e.target.value)
                setTenancyId("")
              }}
              disabled={!!editing}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm disabled:opacity-50"
            >
              <option value="">Select property</option>
              {(properties.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="agr-tenancy">Tenancy *</Label>
            <select
              id="agr-tenancy"
              value={tenancyId}
              onChange={(e) => setTenancyId(e.target.value)}
              disabled={!propertyId || tenancies.isLoading}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm disabled:opacity-50"
            >
              <option value="">
                {tenancies.isLoading ? "Loading…" : "Select tenancy"}
              </option>
              {(tenancies.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.tenant_name}
                  {t.flat_number ? ` — Flat ${t.flat_number}` : ""} (since{" "}
                  {t.start_date})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="agr-start">Start date</Label>
            <Input
              id="agr-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="agr-end">End date</Label>
            <Input
              id="agr-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="agr-notes">Notes</Label>
          <textarea
            id="agr-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Lock-in period, notice terms, …"
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="agr-doc">Agreement document (PDF/photo)</Label>
          {editing?.document_path && !removeDoc && !file ? (
            <div className="flex items-center justify-between rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">
              <span className="truncate">Document attached</span>
              <button
                type="button"
                onClick={() => setRemoveDoc(true)}
                className="inline-flex items-center gap-1 text-destructive hover:underline"
              >
                <X className="h-3.5 w-3.5" /> Remove
              </button>
            </div>
          ) : (
            <Input
              id="agr-doc"
              type="file"
              accept=".pdf,image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          )}
          {file && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <FileUp className="h-3.5 w-3.5" /> {file.name} will be uploaded on save
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : "Save agreement"}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
