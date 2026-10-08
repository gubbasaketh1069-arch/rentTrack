import { useState } from "react"
import { FileDown, Loader2 } from "lucide-react"
import { useToast } from "@/components/ui/toast"
import { supabase } from "@/lib/supabase"
import { generateAgreementPdf, uploadAgreementPdf } from "@/lib/agreementDoc"
import type { RentalAgreement } from "@/hooks/useAgreementData"

/**
 * Generate a rental agreement PDF from tenancy data (added feature).
 * Auto-fills parties, premises, term, rent/deposit; clauses are labeled
 * as a template. Downloads the PDF and optionally saves it to the
 * agreement's document slot.
 */
export default function GenerateAgreementButton({
  agreement,
  onSaved,
}: {
  agreement: RentalAgreement
  onSaved?: () => void
}) {
  const { toast } = useToast()
  const [working, setWorking] = useState(false)

  async function handleGenerate() {
    setWorking(true)
    try {
      // Pull tenancy + related rows for auto-fill.
      const { data: tenancy, error: tErr } = await supabase
        .from("tenancies")
        .select("id, start_date, end_date, tenant_id, property_id, flat_id")
        .eq("id", agreement.tenancy_id)
        .single()
      if (tErr) throw new Error(tErr.message)
      const t = tenancy as {
        start_date: string | null
        end_date: string | null
        tenant_id: string
        property_id: string
        flat_id: string | null
      }

      const [{ data: tenantRow }, { data: propertyRow }, { data: flatRow }] =
        await Promise.all([
          supabase.from("tenants").select("full_name").eq("id", t.tenant_id).single(),
          supabase.from("properties").select("name, address, city, owner_id").eq("id", t.property_id).single(),
          t.flat_id
            ? supabase.from("flats").select("flat_number, rent, deposit, maintenance").eq("id", t.flat_id).single()
            : Promise.resolve({ data: null }),
        ])

      const tenant = tenantRow as { full_name: string } | null
      const property = propertyRow as { name: string; address: string | null; city: string | null; owner_id: string } | null
      const flat = flatRow as { flat_number: string; rent: number | string; deposit: number | string; maintenance: number | string } | null

      let ownerName = "The Owner"
      if (property?.owner_id) {
        const { data: ownerRow } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", property.owner_id)
          .single()
        const on = (ownerRow as { full_name: string | null } | null)?.full_name
        if (on) ownerName = on
      }

      const fmtDate = (iso: string | null) =>
        iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "—"

      const pdf = generateAgreementPdf({
        ownerName,
        tenantName: tenant?.full_name ?? agreement.tenant_name ?? "The Tenant",
        propertyName: property?.name ?? agreement.property_name ?? "",
        propertyAddress: [property?.address, property?.city].filter(Boolean).join(", "),
        flatNumber: flat?.flat_number ?? agreement.flat_number ?? "",
        floorLabel: "",
        monthlyRent: Number(flat?.rent ?? 0),
        deposit: Number(flat?.deposit ?? 0),
        maintenance: Number(flat?.maintenance ?? 0),
        startDate: fmtDate(agreement.start_date ?? t.start_date),
        endDate: fmtDate(agreement.end_date ?? t.end_date),
        agreementDate: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
      })

      // Download for the owner to review/sign.
      pdf.save(`rental-agreement-${(tenant?.full_name ?? "tenant").replace(/\s+/g, "-").toLowerCase()}.pdf`)

      // Also save a copy to the agreement's document slot (private bucket).
      if (agreement.property_id) {
        try {
          const path = await uploadAgreementPdf(pdf, agreement.property_id, agreement.id)
          const { error: updErr } = await supabase
            .from("rental_agreements")
            .update({ document_path: path })
            .eq("id", agreement.id)
          if (!updErr) {
            onSaved?.()
            toast("success", "Agreement PDF generated and saved to the agreement record.")
            return
          }
        } catch (saveErr) {
          console.warn("Could not save generated agreement to storage:", saveErr)
        }
      }
      toast("success", "Agreement PDF downloaded.")
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not generate agreement.")
    } finally {
      setWorking(false)
    }
  }

  return (
    <button
      type="button"
      aria-label="Generate agreement PDF"
      title="Generate agreement PDF from tenancy data"
      onClick={() => void handleGenerate()}
      disabled={working}
      className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
    >
      {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
    </button>
  )
}
