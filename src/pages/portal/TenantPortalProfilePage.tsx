import { useEffect, useState } from "react"
import { Pencil } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import TenantGate from "@/components/portal/TenantGate"
import { useToast } from "@/components/ui/toast"
import {
  useFamilyMembers,
  usePhoneNumbers,
  useUpdateTenant,
  type Tenant,
} from "@/hooks/useTenantData"

/** "XXXX XXXX 1234" — never show more than the last 4 digits. */
function maskAadhaar(aadhaar: string | null): string {
  if (!aadhaar) return "—"
  const digits = aadhaar.replace(/\D/g, "")
  if (digits.length < 4) return "XXXX XXXX XXXX"
  return `XXXX XXXX ${digits.slice(-4)}`
}

function ProfileBody({ tenant }: { tenant: Tenant }) {
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    full_name: tenant.full_name ?? "",
    primary_phone: tenant.primary_phone ?? "",
    address: tenant.address ?? "",
    occupation: tenant.occupation ?? "",
    place_of_work: tenant.place_of_work ?? "",
    notes: tenant.notes ?? "",
  })

  useEffect(() => {
    setForm({
      full_name: tenant.full_name ?? "",
      primary_phone: tenant.primary_phone ?? "",
      address: tenant.address ?? "",
      occupation: tenant.occupation ?? "",
      place_of_work: tenant.place_of_work ?? "",
      notes: tenant.notes ?? "",
    })
  }, [tenant])

  const update = useUpdateTenant(tenant.id)
  const family = useFamilyMembers(tenant.id)
  const phones = usePhoneNumbers(tenant.id)

  async function handleSave() {
    if (!form.full_name.trim()) {
      toast("error", "Name is required")
      return
    }
    try {
      await update.mutateAsync({
        full_name: form.full_name.trim(),
        primary_phone: form.primary_phone.trim() || null,
        address: form.address.trim() || null,
        occupation: form.occupation.trim() || null,
        place_of_work: form.place_of_work.trim() || null,
        notes: form.notes.trim() || null,
      })
      setEditing(false)
      toast("success", "Profile updated")
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Couldn't save")
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const infoRows: Array<[string, string]> = [
    ["Full name", tenant.full_name],
    ["Primary phone", tenant.primary_phone ?? "—"],
    ["Address", tenant.address ?? "—"],
    ["Occupation", tenant.occupation ?? "—"],
    ["Place of work", tenant.place_of_work ?? "—"],
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Profile</h2>
        {!editing && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="mr-1 h-4 w-4" /> Edit
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">My details</CardTitle>
        </CardHeader>
        <CardContent>
          {editing ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pf-name">Full name</Label>
                <Input id="pf-name" value={form.full_name} onChange={set("full_name")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pf-phone">Primary phone</Label>
                <Input id="pf-phone" value={form.primary_phone} onChange={set("primary_phone")} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="pf-address">Address</Label>
                <Textarea id="pf-address" value={form.address} onChange={set("address")} rows={2} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pf-occ">Occupation</Label>
                <Input id="pf-occ" value={form.occupation} onChange={set("occupation")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pf-work">Place of work</Label>
                <Input id="pf-work" value={form.place_of_work} onChange={set("place_of_work")} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="pf-notes">Notes</Label>
                <Textarea id="pf-notes" value={form.notes} onChange={set("notes")} rows={2} />
              </div>
              <div className="flex gap-2 sm:col-span-2">
                <Button size="sm" onClick={handleSave} disabled={update.isPending}>
                  {update.isPending ? "Saving…" : "Save"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {infoRows.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 border-b py-2">
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  <dd className="text-sm font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {!editing && tenant.notes && (
            <p className="mt-3 text-sm text-muted-foreground">Note: {tenant.notes}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Phone numbers</CardTitle>
        </CardHeader>
        <CardContent>
          {phones.isLoading ? (
            <Skeleton className="h-10" />
          ) : (phones.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No extra phone numbers.</p>
          ) : (
            <ul className="space-y-2">
              {(phones.data ?? []).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    {p.phone}
                    {p.label && <span className="ml-2 text-muted-foreground">{p.label}</span>}
                  </span>
                  {p.is_primary && <Badge variant="neutral">Primary</Badge>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Family members</CardTitle>
        </CardHeader>
        <CardContent>
          {family.isLoading ? (
            <Skeleton className="h-16" />
          ) : (family.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No family members recorded.</p>
          ) : (
            <ul className="space-y-2.5">
              {(family.data ?? []).map((m) => (
                <li key={m.id} className="rounded-lg border px-3 py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{m.name}</span>
                    <span className="text-xs text-muted-foreground">{m.relationship ?? ""}</span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    Aadhaar: {maskAadhaar(m.aadhaar_number)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            To add or change family members, ask your property owner.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

/** Tenant's own profile: edit own contact fields, read-only family/phones. */
export default function TenantPortalProfilePage() {
  return (
    <TenantGate>
      {({ tenant }) => <ProfileBody tenant={tenant} />}
    </TenantGate>
  )
}
