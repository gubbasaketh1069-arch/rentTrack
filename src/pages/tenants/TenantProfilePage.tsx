import { useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { ArrowLeft, Eye, EyeOff, Pencil, Phone, Plus, Trash2, Users } from "lucide-react"
import { intervalToDuration } from "date-fns"
import {
  useAddPhoneNumber,
  useDeleteFamilyMember,
  useDeletePhoneNumber,
  useFamilyMembers,
  usePhoneNumbers,
  useSetPrimaryPhone,
  useTenant,
  useTenantTenancies,
  useTenantActiveTenancy,
  useUpdateTenant,
  type FamilyMember,
  type Tenancy,
} from "@/hooks/useTenantData"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, ConfirmDialog } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"
import FamilyMemberDialog from "@/components/tenants/FamilyMemberDialog"
import EndTenancyDialog from "@/components/tenants/EndTenancyDialog"
import LinkLoginCard from "@/components/tenants/LinkLoginCard"
import RentBillsTab from "@/components/billing/RentBillsTab"
import PaymentsTab from "@/components/billing/PaymentsTab"
import AdvanceTab from "@/components/billing/AdvanceTab"
import RentalScoreCard from "@/components/billing/RentalScoreCard"
import TenantMandatesCard from "@/components/billing/TenantMandatesCard"

type Tab = "overview" | "rent" | "payments" | "advance" | "family" | "phones" | "history"

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "rent", label: "Rent & Bills" },
  { id: "payments", label: "Payments" },
  { id: "advance", label: "Advance" },
  { id: "family", label: "Family" },
  { id: "phones", label: "Phones" },
  { id: "history", label: "Tenancy History" },
]

const TENANCY_BADGE: Record<Tenancy["status"], "paid" | "neutral"> = {
  ACTIVE: "paid",
  ENDED: "neutral",
  CANCELLED: "neutral",
}

/** "2 years 8 months" from a start date until today. */
function stayDuration(startDate: string): string {
  const start = new Date(`${startDate}T00:00:00`)
  const d = intervalToDuration({ start, end: new Date() })
  const parts: string[] = []
  if (d.years) parts.push(`${d.years} year${d.years === 1 ? "" : "s"}`)
  if (d.months) parts.push(`${d.months} month${d.months === 1 ? "" : "s"}`)
  if (parts.length > 0) return parts.join(" ")
  const days = d.days ?? 0
  return days <= 1 ? "Less than a day" : `${days} days`
}

/** "XXXX XXXX 1234" — never show more than the last 4 digits. */
function maskAadhaar(aadhaar: string | null): string {
  if (!aadhaar) return "—"
  const digits = aadhaar.replace(/\D/g, "")
  if (digits.length < 4) return "XXXX XXXX XXXX"
  return `XXXX XXXX ${digits.slice(-4)}`
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  )
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return iso
}

/**
 * Tenant profile (spec section 69). Only the tabs whose data modules exist
 * are shown — Rent, Payments, Due, Meters, Documents and Reports arrive in
 * later phases. No dead tabs.
 */
export default function TenantProfilePage() {
  const { id } = useParams()
  const { toast } = useToast()
  const [tab, setTab] = useState<Tab>("overview")

  const tenant = useTenant(id)
  const tenancies = useTenantTenancies(id)
  const activeTenancy = useTenantActiveTenancy(id)
  const family = useFamilyMembers(id)
  const phones = usePhoneNumbers(id)

  const updateTenant = useUpdateTenant(id ?? "")
  const deleteFamilyMember = useDeleteFamilyMember(id ?? "")
  const addPhone = useAddPhoneNumber(id ?? "")
  const deletePhone = useDeletePhoneNumber(id ?? "")
  const setPrimary = useSetPrimaryPhone(id ?? "")

  const [editOpen, setEditOpen] = useState(false)
  const [editFields, setEditFields] = useState({
    full_name: "",
    primary_phone: "",
    address: "",
    occupation: "",
    place_of_work: "",
    notes: "",
  })

  const [memberDialog, setMemberDialog] = useState<{
    open: boolean
    member: FamilyMember | null
  }>({ open: false, member: null })
  const [deletingMember, setDeletingMember] = useState<FamilyMember | null>(null)
  const [revealedAadhaar, setRevealedAadhaar] = useState<string | null>(null)
  const [revealCandidate, setRevealCandidate] = useState<FamilyMember | null>(null)

  const [newPhone, setNewPhone] = useState("")
  const [newPhoneLabel, setNewPhoneLabel] = useState("")
  const [deletingPhoneId, setDeletingPhoneId] = useState<string | null>(null)

  const [endOpen, setEndOpen] = useState(false)

  const tenantSince = useMemo(() => {
    const dates = (tenancies.data ?? [])
      .map((t) => t.start_date)
      .filter(Boolean)
      .sort()
    return dates.length > 0 ? dates[0] : null
  }, [tenancies.data])

  function openEdit() {
    const t = tenant.data
    if (!t) return
    setEditFields({
      full_name: t.full_name,
      primary_phone: t.primary_phone ?? "",
      address: t.address ?? "",
      occupation: t.occupation ?? "",
      place_of_work: t.place_of_work ?? "",
      notes: t.notes ?? "",
    })
    setEditOpen(true)
  }

  async function handleEditSave() {
    if (!editFields.full_name.trim()) {
      toast("error", "Full name is required.")
      return
    }
    try {
      await updateTenant.mutateAsync({
        full_name: editFields.full_name.trim(),
        primary_phone: editFields.primary_phone.trim() || null,
        address: editFields.address.trim() || null,
        occupation: editFields.occupation.trim() || null,
        place_of_work: editFields.place_of_work.trim() || null,
        notes: editFields.notes.trim() || null,
      })
      toast("success", "Tenant updated.")
      setEditOpen(false)
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Something went wrong.")
    }
  }

  async function handleDeleteMember() {
    if (!deletingMember) return
    try {
      await deleteFamilyMember.mutateAsync(deletingMember.id)
      toast("success", "Family member removed.")
      setDeletingMember(null)
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Something went wrong.")
    }
  }

  async function handleAddPhone() {
    if (!newPhone.trim()) {
      toast("error", "Phone number is required.")
      return
    }
    try {
      await addPhone.mutateAsync({ phone: newPhone, label: newPhoneLabel })
      toast("success", "Phone number added.")
      setNewPhone("")
      setNewPhoneLabel("")
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Something went wrong.")
    }
  }

  async function handleSetPrimary(phoneId: string, phone: string) {
    try {
      await setPrimary.mutateAsync({ phoneId, phone })
      toast("success", "Primary number updated.")
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Something went wrong.")
    }
  }

  async function handleDeletePhone() {
    if (!deletingPhoneId) return
    try {
      await deletePhone.mutateAsync(deletingPhoneId)
      toast("success", "Phone number removed.")
      setDeletingPhoneId(null)
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Something went wrong.")
    }
  }

  if (tenant.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (tenant.error || !tenant.data) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Couldn't load tenant:{" "}
        {tenant.error ? (tenant.error as Error).message : "Not found."}
      </p>
    )
  }

  const t = tenant.data
  const active = activeTenancy.data

  // Billing tabs are scoped to one tenancy: the active one, or the most
  // recent one when there is no active tenancy.
  const billingTenancy = active ?? (tenancies.data ?? [])[0] ?? null

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          to="/tenants"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 mb-1")}
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Tenants
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{t.full_name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {tenantSince ? (
                <>
                  Tenant since {tenantSince} · {stayDuration(tenantSince)}
                </>
              ) : (
                "No tenancies yet"
              )}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={openEdit}>
            <Pencil className="mr-1 h-3 w-3" /> Edit tenant
          </Button>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b">
        {TABS.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={cn(
              "whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium",
              tab === tb.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tb.label}
            {tb.id === "family" && (family.data ?? []).length > 0 && (
              <span className="ml-1.5 rounded-full bg-muted px-2 py-0.5 text-xs">
                {family.data!.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Personal details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <Field label="Primary phone" value={t.primary_phone || "—"} />
              <Field label="Occupation" value={t.occupation || "—"} />
              <Field label="Place of work" value={t.place_of_work || "—"} />
              <Field label="Address" value={t.address || "—"} />
            </CardContent>
          </Card>

          {t.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{t.notes}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Current tenancy</CardTitle>
              <CardDescription>
                Determined by the tenant's active tenancy record.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activeTenancy.isLoading ? (
                <Skeleton className="h-10 w-2/3" />
              ) : active ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {active.property?.name ?? "—"} · Flat{" "}
                      {active.flat?.flat_number ?? "—"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Since {active.start_date}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={TENANCY_BADGE[active.status]}>{active.status}</Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEndOpen(true)}
                    >
                      End tenancy
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No active tenancy. Start one from an available flat's{" "}
                  <span className="font-medium text-foreground">+ Add tenant</span>{" "}
                  button.
                </p>
              )}
            </CardContent>
          </Card>

          <LinkLoginCard tenant={t} />

          <RentalScoreCard tenantId={t.id} tenancyId={billingTenancy?.id} />

          <TenantMandatesCard tenantId={t.id} />
        </div>
      )}

      {tab === "rent" &&
        (billingTenancy ? (
          <RentBillsTab
            tenantId={t.id}
            tenantName={t.full_name}
            tenancy={billingTenancy}
          />
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No tenancy to bill yet. Start a tenancy from an available flat's{" "}
              <span className="font-medium text-foreground">+ Add tenant</span>{" "}
              button.
            </CardContent>
          </Card>
        ))}

      {tab === "payments" &&
        (billingTenancy ? (
          <PaymentsTab tenancyId={billingTenancy.id} />
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No payments yet.
            </CardContent>
          </Card>
        ))}

      {tab === "advance" &&
        (billingTenancy ? (
          <AdvanceTab tenancy={billingTenancy} />
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No tenancy to track a deposit against yet.
            </CardContent>
          </Card>
        ))}

      {tab === "family" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Family members stay on record even after the tenant moves out.
            </p>
            <Button size="sm" onClick={() => setMemberDialog({ open: true, member: null })}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add member
            </Button>
          </div>
          {family.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          ) : family.error ? (
            <p className="text-sm text-destructive" role="alert">
              Couldn't load family members: {(family.error as Error).message}
            </p>
          ) : (family.data ?? []).length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Users className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="max-w-sm text-sm text-muted-foreground">
                  No family members recorded yet.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {(family.data ?? []).map((m) => (
                <Card key={m.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">{m.name}</CardTitle>
                        {m.relationship && (
                          <CardDescription>{m.relationship}</CardDescription>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setMemberDialog({ open: true, member: m })}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingMember(m)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Aadhaar</span>
                      <span className="flex items-center gap-1 font-mono text-xs">
                        {revealedAadhaar === m.id
                          ? m.aadhaar_number ?? "—"
                          : maskAadhaar(m.aadhaar_number)}
                        {m.aadhaar_number && (
                          <button
                            type="button"
                            onClick={() =>
                              revealedAadhaar === m.id
                                ? setRevealedAadhaar(null)
                                : setRevealCandidate(m)
                            }
                            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                            aria-label={revealedAadhaar === m.id ? "Hide Aadhaar" : "Reveal Aadhaar"}
                          >
                            {revealedAadhaar === m.id ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                      </span>
                    </div>
                    {m.phone && (
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Phone</span>
                        <span>{m.phone}</span>
                      </div>
                    )}
                    {(m.dob || m.age != null) && (
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">DOB / Age</span>
                        <span>
                          {[m.dob, m.age != null ? `${m.age} yrs` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </div>
                    )}
                    {m.occupation && (
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Occupation</span>
                        <span>{m.occupation}</span>
                      </div>
                    )}
                    {(m.joined_date || m.left_date) && (
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Stay</span>
                        <span>
                          {formatDate(m.joined_date)} → {m.left_date ? formatDate(m.left_date) : "present"}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "phones" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add phone number</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  placeholder="Phone number"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  inputMode="tel"
                  className="sm:max-w-xs"
                />
                <Input
                  placeholder="Label (Home, Work…)"
                  value={newPhoneLabel}
                  onChange={(e) => setNewPhoneLabel(e.target.value)}
                  className="sm:max-w-xs"
                />
                <Button onClick={handleAddPhone} disabled={addPhone.isPending}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  {addPhone.isPending ? "Adding…" : "Add"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {phones.isLoading ? (
            <Skeleton className="h-24" />
          ) : phones.error ? (
            <p className="text-sm text-destructive" role="alert">
              Couldn't load phone numbers: {(phones.error as Error).message}
            </p>
          ) : (phones.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No extra numbers. The primary phone on the Overview tab is the
              tenant's main contact.
            </p>
          ) : (
            <div className="space-y-2">
              {(phones.data ?? []).map((p) => (
                <Card key={p.id}>
                  <CardContent className="flex items-center justify-between gap-3 py-3">
                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{p.phone}</p>
                        {p.label && (
                          <p className="text-xs text-muted-foreground">{p.label}</p>
                        )}
                      </div>
                      {p.is_primary && <Badge variant="paid">Primary</Badge>}
                    </div>
                    <div className="flex gap-1">
                      {!p.is_primary && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSetPrimary(p.id, p.phone)}
                        >
                          Set primary
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeletingPhoneId(p.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-3">
          {tenancies.isLoading ? (
            <>
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </>
          ) : tenancies.error ? (
            <p className="text-sm text-destructive" role="alert">
              Couldn't load tenancy history: {(tenancies.error as Error).message}
            </p>
          ) : (tenancies.data ?? []).length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No tenancies recorded for this tenant yet.
              </CardContent>
            </Card>
          ) : (
            (tenancies.data ?? []).map((tn) => (
              <Card key={tn.id}>
                <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
                  <div>
                    <p className="font-medium">
                      {tn.property?.name ?? "—"} · Flat {tn.flat?.flat_number ?? "—"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {tn.start_date} → {tn.end_date ?? "present"}
                    </p>
                    {tn.exit_reason && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Exit: {tn.exit_reason}
                      </p>
                    )}
                    {(tn.entry_notes || tn.exit_notes) && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {[tn.entry_notes, tn.exit_notes].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={TENANCY_BADGE[tn.status]}>{tn.status}</Badge>
                    {tn.status === "ACTIVE" && (
                      <Button variant="outline" size="sm" onClick={() => setEndOpen(true)}>
                        End tenancy
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Edit tenant dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} title="Edit tenant" wide>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="te-name">Full name *</Label>
            <Input
              id="te-name"
              className="mt-1"
              value={editFields.full_name}
              onChange={(e) => setEditFields({ ...editFields, full_name: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="te-phone">Primary phone</Label>
            <Input
              id="te-phone"
              className="mt-1"
              value={editFields.primary_phone}
              onChange={(e) => setEditFields({ ...editFields, primary_phone: e.target.value })}
              inputMode="tel"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="te-address">Address</Label>
            <Input
              id="te-address"
              className="mt-1"
              value={editFields.address}
              onChange={(e) => setEditFields({ ...editFields, address: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="te-occupation">Occupation</Label>
            <Input
              id="te-occupation"
              className="mt-1"
              value={editFields.occupation}
              onChange={(e) => setEditFields({ ...editFields, occupation: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="te-work">Place of work</Label>
            <Input
              id="te-work"
              className="mt-1"
              value={editFields.place_of_work}
              onChange={(e) => setEditFields({ ...editFields, place_of_work: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="te-notes">Notes</Label>
            <Textarea
              id="te-notes"
              className="mt-1"
              rows={2}
              value={editFields.notes}
              onChange={(e) => setEditFields({ ...editFields, notes: e.target.value })}
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setEditOpen(false)} disabled={updateTenant.isPending}>
            Cancel
          </Button>
          <Button onClick={handleEditSave} disabled={updateTenant.isPending}>
            {updateTenant.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </Dialog>

      <FamilyMemberDialog
        open={memberDialog.open}
        onClose={() => setMemberDialog({ open: false, member: null })}
        tenantId={t.id}
        member={memberDialog.member}
      />

      <ConfirmDialog
        open={!!deletingMember}
        onClose={() => setDeletingMember(null)}
        onConfirm={handleDeleteMember}
        title={`Remove ${deletingMember?.name}?`}
        message="The family member record is removed. This does not affect the tenant or their tenancy history."
        confirming={deleteFamilyMember.isPending}
      />

      <ConfirmDialog
        open={!!deletingPhoneId}
        onClose={() => setDeletingPhoneId(null)}
        onConfirm={handleDeletePhone}
        title="Remove this phone number?"
        message="The number is removed from the tenant's contact list."
        confirming={deletePhone.isPending}
      />

      <ConfirmDialog
        open={!!revealCandidate}
        onClose={() => setRevealCandidate(null)}
        onConfirm={() => {
          setRevealedAadhaar(revealCandidate!.id)
          setRevealCandidate(null)
        }}
        title="Reveal full Aadhaar number?"
        message="Aadhaar numbers are sensitive. Only reveal this if you need it for verification, and never share or export it."
        confirmLabel="Reveal"
      />

      {active && (
        <EndTenancyDialog
          open={endOpen}
          onClose={() => setEndOpen(false)}
          tenancyId={active.id}
          tenantId={t.id}
          propertyId={active.property_id}
          flatId={active.flat_id}
          flatNumber={active.flat?.flat_number ?? null}
          tenantName={t.full_name}
        />
      )}
    </div>
  )
}
