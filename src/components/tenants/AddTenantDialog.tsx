import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Search, UserPlus, UserCheck, BedDouble } from "lucide-react"
import { supabase } from "@/lib/supabase"
import {
  useCreateTenant,
  useStartTenancy,
  useTenant,
  useTenantActiveTenancy,
  useTenants,
  type TenantDirectoryRow,
  type TenantInput,
} from "@/hooks/useTenantData"
import {
  useFlats,
  useMyProperties,
  useSharedProperties,
} from "@/hooks/usePropertyData"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"

interface AddTenantDialogProps {
  open: boolean
  onClose: () => void
  /** Fixed context when launched from a flat. Omitted when launched from /tenants. */
  propertyId?: string
  flatId?: string
  onTenantReady?: (tenantId: string) => void
  /** Converting an interest: skip to tenancy details for this existing tenant. */
  preselectedTenantId?: string
}

const inputCls = "mt-1"

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Add-tenant flow (spec sections 7, 10, 78):
 * Step 1 — find an existing tenant (never duplicate a person) or create one.
 * Step 2 — tenancy details (property, flat, effective start date, notes).
 * Confirming creates the ACTIVE tenancy and marks the flat OCCUPIED.
 */
export default function AddTenantDialog({
  open,
  onClose,
  propertyId: fixedPropertyId,
  flatId: fixedFlatId,
  onTenantReady,
  preselectedTenantId,
}: AddTenantDialogProps) {
  const { toast } = useToast()
  const createTenant = useCreateTenant()
  const startTenancy = useStartTenancy()

  const [step, setStep] = useState<1 | 2>(1)
  const [search, setSearch] = useState("")
  const [debounced, setDebounced] = useState("")
  const [selected, setSelected] = useState<TenantDirectoryRow | null>(null)
  const [creating, setCreating] = useState(false)

  const [fullName, setFullName] = useState("")
  const [primaryPhone, setPrimaryPhone] = useState("")
  const [address, setAddress] = useState("")
  const [occupation, setOccupation] = useState("")
  const [placeOfWork, setPlaceOfWork] = useState("")
  const [notes, setNotes] = useState("")

  const [propertyId, setPropertyId] = useState(fixedPropertyId ?? "")
  const [flatId, setFlatId] = useState(fixedFlatId ?? "")
  const [startDate, setStartDate] = useState(todayISO())
  const [entryNotes, setEntryNotes] = useState("")
  const [bedNumber, setBedNumber] = useState("")
  const [error, setError] = useState<string | null>(null)

  // Reset every time the dialog opens.
  useEffect(() => {
    if (open) {
      setStep(1)
      setSearch("")
      setDebounced("")
      setSelected(null)
      setCreating(false)
      setFullName("")
      setPrimaryPhone("")
      setAddress("")
      setOccupation("")
      setPlaceOfWork("")
      setNotes("")
      setPropertyId(fixedPropertyId ?? "")
      setFlatId(fixedFlatId ?? "")
      setStartDate(todayISO())
      setEntryNotes("")
      setBedNumber("")
      setError(null)
    }
  }, [open, fixedPropertyId, fixedFlatId])

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search), 350)
    return () => window.clearTimeout(t)
  }, [search])

  const searchResults = useTenants(debounced)
  const showResults = debounced.trim().length >= 2

  const selectedActive = useTenantActiveTenancy(selected?.id)

  // Interest conversion: jump straight to tenancy details for an existing tenant.
  const preselected = useTenant(open ? preselectedTenantId : undefined)
  const preselectedActive = useTenantActiveTenancy(
    open ? preselectedTenantId : undefined
  )
  useEffect(() => {
    if (open && preselectedTenantId && preselected.data) {
      const at = preselectedActive.data
      setSelected({
        ...preselected.data,
        activeTenancy: at
          ? {
              id: at.id,
              start_date: at.start_date,
              property_name: at.property?.name ?? null,
              flat_number: at.flat?.flat_number ?? null,
            }
          : null,
      })
      setStep(2)
    }
  }, [open, preselectedTenantId, preselected.data, preselectedActive.data])

  const myProps = useMyProperties()
  const sharedProps = useSharedProperties()
  const properties = useMemo(
    () => [...(myProps.data ?? []), ...(sharedProps.data ?? [])],
    [myProps.data, sharedProps.data]
  )
  const choosingProperty = !fixedPropertyId
  const flatsQuery = useFlats(choosingProperty ? propertyId || undefined : fixedPropertyId)
  const availableFlats = useMemo(
    () => (flatsQuery.data ?? []).filter((f) => f.status === "AVAILABLE"),
    [flatsQuery.data]
  )
  const fixedFlatNumber = useMemo(
    () => (flatsQuery.data ?? []).find((f) => f.id === flatId)?.flat_number,
    [flatsQuery.data, flatId]
  )

  // PG mode: which beds are taken in the chosen flat.
  const chosenFlat = useMemo(
    () => (flatsQuery.data ?? []).find((f) => f.id === flatId) ?? null,
    [flatsQuery.data, flatId]
  )
  const isPgFlat = !!chosenFlat?.is_pg && (chosenFlat?.bed_count ?? 0) > 0
  const occupiedBeds = useQuery({
    queryKey: ["flat-beds", flatId],
    queryFn: async (): Promise<number[]> => {
      const { data, error } = await supabase
        .from("tenancies")
        .select("bed_number")
        .eq("flat_id", flatId!)
        .eq("status", "ACTIVE")
      if (error) throw new Error(error.message)
      return ((data ?? []) as Array<{ bed_number: number | null }>)
        .map((t) => t.bed_number)
        .filter((b): b is number => b != null)
    },
    enabled: !!flatId && isPgFlat,
  })
  const freeBeds = useMemo(() => {
    if (!isPgFlat || !chosenFlat) return []
    const taken = new Set(occupiedBeds.data ?? [])
    return Array.from({ length: chosenFlat.bed_count }, (_, i) => i + 1).filter(
      (b) => !taken.has(b)
    )
  }, [isPgFlat, chosenFlat, occupiedBeds.data])

  const saving = createTenant.isPending || startTenancy.isPending

  function goToDetails() {
    setError(null)
    setStep(2)
  }

  async function handleConfirm() {
    setError(null)
    if (!propertyId || !flatId || !startDate) {
      setError("Property, flat and start date are required.")
      return
    }
    let bed: number | null = null
    if (isPgFlat) {
      bed = Number(bedNumber)
      if (!(bed > 0)) {
        setError("Pick a free bed for this PG flat.")
        return
      }
      if (!freeBeds.includes(bed)) {
        setError(`Bed ${bed} was just taken. Pick another bed.`)
        return
      }
    }
    try {
      let tenantId = selected?.id
      if (!tenantId) {
        if (!fullName.trim()) {
          setError("Tenant name is required.")
          return
        }
        const input: TenantInput = {
          full_name: fullName.trim(),
          primary_phone: primaryPhone.trim() || null,
          address: address.trim() || null,
          occupation: occupation.trim() || null,
          place_of_work: placeOfWork.trim() || null,
          notes: notes.trim() || null,
        }
        const created = await createTenant.mutateAsync(input)
        tenantId = created.id
      }
      const moveFrom =
        selectedActive.data && selectedActive.data.flat_id !== flatId
          ? {
              tenancyId: selectedActive.data.id,
              flatId: selectedActive.data.flat_id,
            }
          : null
      await startTenancy.mutateAsync({
        tenantId,
        propertyId,
        flatId,
        startDate,
        entryNotes,
        bedNumber: bed,
        moveFrom,
      })
      toast(
        "success",
        isPgFlat
          ? `Tenancy started — Bed ${bed} is now occupied.`
          : "Tenancy started — the flat is now occupied."
      )
      onTenantReady?.(tenantId)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.")
    }
  }

  const moveInfo = selectedActive.data
  const moving =
    !!moveInfo && moveInfo.flat_id !== flatId && moveInfo.flat_id !== null

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add tenant"
      description={
        step === 1
          ? "Find the person first — a tenant record is reused across flats, never duplicated."
          : "Tenancy details. The start date is the effective entry date and may be in the past."
      }
      wide
    >
      {step === 1 && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search existing tenants by name or phone…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setSelected(null)
                setCreating(false)
              }}
            />
          </div>

          {showResults && (
            <div className="space-y-2">
              {searchResults.isLoading ? (
                <p className="text-sm text-muted-foreground">Searching…</p>
              ) : searchResults.error ? (
                <p className="text-sm text-destructive" role="alert">
                  Search failed: {(searchResults.error as Error).message}
                </p>
              ) : (searchResults.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No matching tenants found. Create a new tenant record below.
                </p>
              ) : (
                (searchResults.data ?? []).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setSelected(t)
                      setCreating(false)
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left hover:bg-accent",
                      selected?.id === t.id && "border-primary bg-accent"
                    )}
                  >
                    <span>
                      <span className="flex items-center gap-2 font-medium">
                        <UserCheck className="h-4 w-4 text-muted-foreground" />
                        {t.full_name}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {[t.primary_phone, t.activeTenancy ? `${t.activeTenancy.property_name ?? ""} · ${t.activeTenancy.flat_number ?? ""}`.trim() : "No active tenancy"]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    {selected?.id === t.id && (
                      <span className="text-xs font-medium text-primary">Selected</span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}

          {!selected && (
            <div className="rounded-lg border border-dashed p-4">
              <button
                type="button"
                onClick={() => setCreating((c) => !c)}
                className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                <UserPlus className="h-4 w-4" />
                {creating ? "Hide new-tenant form" : "Create a new tenant"}
              </button>
              {creating && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="at-name">Full name *</Label>
                    <Input
                      id="at-name"
                      className={inputCls}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Rahul Kumar"
                    />
                  </div>
                  <div>
                    <Label htmlFor="at-phone">Primary phone</Label>
                    <Input
                      id="at-phone"
                      className={inputCls}
                      value={primaryPhone}
                      onChange={(e) => setPrimaryPhone(e.target.value)}
                      placeholder="e.g. 98765 43210"
                      inputMode="tel"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="at-address">Address</Label>
                    <Input
                      id="at-address"
                      className={inputCls}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="at-occupation">Occupation</Label>
                    <Input
                      id="at-occupation"
                      className={inputCls}
                      value={occupation}
                      onChange={(e) => setOccupation(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="at-work">Place of work</Label>
                    <Input
                      id="at-work"
                      className={inputCls}
                      value={placeOfWork}
                      onChange={(e) => setPlaceOfWork(e.target.value)}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="at-notes">Notes</Label>
                    <Textarea
                      id="at-notes"
                      className={inputCls}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={goToDetails}
              disabled={!selected && !(creating && fullName.trim())}
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg bg-muted p-3 text-sm">
            <UserCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>
              Tenant:{" "}
              <span className="font-medium">
                {selected ? selected.full_name : fullName.trim()}
              </span>
              {selected && (
                <span className="text-muted-foreground"> (existing record — reused)</span>
              )}
            </span>
          </div>

          {moving && moveInfo && (
            <div className="rounded-lg border border-status-partial/50 bg-status-partial/10 p-3 text-sm">
              <p className="font-medium">This tenant is moving.</p>
              <p className="mt-1 text-muted-foreground">
                They currently occupy {moveInfo.property?.name ?? "a property"}
                {" · "}
                {moveInfo.flat?.flat_number ?? "a flat"} since {moveInfo.start_date}.
                Confirming will end that tenancy on {startDate} and free the old
                flat.
              </p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="at-property">Property *</Label>
              {choosingProperty ? (
                <select
                  id="at-property"
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                  value={propertyId}
                  onChange={(e) => {
                    setPropertyId(e.target.value)
                    setFlatId("")
                  }}
                >
                  <option value="">Select a property…</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  className={inputCls}
                  value={properties.find((p) => p.id === propertyId)?.name ?? "…"}
                  disabled
                />
              )}
            </div>
            <div>
              <Label htmlFor="at-flat">Flat *</Label>
              {fixedFlatId ? (
                <Input
                  className={inputCls}
                  value={fixedFlatNumber ?? "…"}
                  disabled
                />
              ) : (
                <select
                  id="at-flat"
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                  value={flatId}
                  onChange={(e) => setFlatId(e.target.value)}
                  disabled={!propertyId}
                >
                  <option value="">
                    {propertyId ? "Select an available flat…" : "Pick a property first…"}
                  </option>
                  {availableFlats.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.flat_number}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <Label htmlFor="at-start">Start date (Tenant Since) *</Label>
              <Input
                id="at-start"
                type="date"
                className={inputCls}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                The effective entry date — it can be in the past.
              </p>
            </div>
            <div>
              <Label htmlFor="at-entry-notes">Entry notes</Label>
              <Textarea
                id="at-entry-notes"
                className={inputCls}
                value={entryNotes}
                onChange={(e) => setEntryNotes(e.target.value)}
                rows={2}
                placeholder="Keys handed over, initial meter reading…"
              />
            </div>
          </div>

          {isPgFlat && (
            <div className="rounded-lg border p-4">
              <div className="mb-2 flex items-center gap-2">
                <BedDouble className="h-4 w-4 text-muted-foreground" />
                <Label className="font-medium">
                  Pick a bed * <span className="font-normal text-muted-foreground">(PG flat — {chosenFlat?.bed_count} beds)</span>
                </Label>
              </div>
              {occupiedBeds.isLoading ? (
                <p className="text-sm text-muted-foreground">Checking free beds…</p>
              ) : freeBeds.length === 0 ? (
                <p className="text-sm text-destructive" role="alert">
                  All beds are taken — this flat should show as occupied.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {freeBeds.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setBedNumber(String(b))}
                      className={cn(
                        "rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent",
                        bedNumber === String(b) && "border-primary bg-accent"
                      )}
                    >
                      Bed {b}
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Each bed is billed separately — enter the bed's monthly rent in
                the billing record, not the whole flat's rent.
              </p>
            </div>
          )}

          {choosingProperty && properties.length === 0 && (
            <p className="text-sm text-muted-foreground">
              You don't have any properties yet — create one first, then add
              tenants to its flats.
            </p>
          )}

          {choosingProperty && propertyId && availableFlats.length === 0 && !flatsQuery.isLoading && (
            <p className="text-sm text-muted-foreground">
              This property has no available flats right now.
            </p>
          )}

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-between gap-2">
            <Button variant="ghost" onClick={() => setStep(1)} disabled={saving}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleConfirm} disabled={saving}>
                {saving ? "Saving…" : "Start tenancy"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  )
}
