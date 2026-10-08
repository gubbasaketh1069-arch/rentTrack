import { useEffect, useState } from "react"
import type { FormEvent } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import {
  useCreateProperty,
  useProperty,
  useUpdateProperty,
  type PropertyInput,
} from "@/hooks/usePropertyData"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"

const EMPTY: PropertyInput = {
  name: "",
  property_type: "",
  address: "",
  area: "",
  locality: "",
  landmark: "",
  city: "",
  state: "",
  pincode: "",
  description: "",
  floor_structure: "",
  notes: "",
  effective_date: "",
  late_fee_enabled: false,
  late_fee_grace_days: 5,
  late_fee_fixed: 0,
  late_fee_per_day: 0,
}

function blank(v: string): string | null {
  return v.trim() === "" ? null : v.trim()
}

/**
 * Create / edit a property (spec section 5). Editing only updates the
 * property row itself — tenant, rent and payment history live in other
 * tables and are never touched.
 */
export default function PropertyFormPage() {
  const { id } = useParams()
  const isEdit = !!id
  const navigate = useNavigate()
  const { toast } = useToast()
  const existing = useProperty(id)
  const createMutation = useCreateProperty()
  const updateMutation = useUpdateProperty(id ?? "")

  const [form, setForm] = useState<PropertyInput>(EMPTY)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (existing.data) {
      const p = existing.data
      setForm({
        name: p.name,
        property_type: p.property_type ?? "",
        address: p.address ?? "",
        area: p.area ?? "",
        locality: p.locality ?? "",
        landmark: p.landmark ?? "",
        city: p.city ?? "",
        state: p.state ?? "",
        pincode: p.pincode ?? "",
        description: p.description ?? "",
        floor_structure: p.floor_structure ?? "",
        notes: p.notes ?? "",
        effective_date: p.effective_date ?? "",
        late_fee_enabled: Boolean(p.late_fee_enabled),
        late_fee_grace_days: p.late_fee_grace_days ?? 5,
        late_fee_fixed: p.late_fee_fixed ?? 0,
        late_fee_per_day: p.late_fee_per_day ?? 0,
      })
    }
  }, [existing.data])

  function set(key: keyof PropertyInput, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!form.name.trim()) {
      setError("Property name is required.")
      return
    }
    const payload: PropertyInput = {
      name: form.name.trim(),
      property_type: blank(form.property_type ?? ""),
      address: blank(form.address ?? ""),
      area: blank(form.area ?? ""),
      locality: blank(form.locality ?? ""),
      landmark: blank(form.landmark ?? ""),
      city: blank(form.city ?? ""),
      state: blank(form.state ?? ""),
      pincode: blank(form.pincode ?? ""),
      description: blank(form.description ?? ""),
      floor_structure: blank(form.floor_structure ?? ""),
      notes: blank(form.notes ?? ""),
      effective_date: blank(form.effective_date ?? ""),
      late_fee_enabled: Boolean(form.late_fee_enabled),
      late_fee_grace_days: Math.max(0, Math.floor(Number(form.late_fee_grace_days) || 0)),
      late_fee_fixed: Math.max(0, Number(form.late_fee_fixed) || 0),
      late_fee_per_day: Math.max(0, Number(form.late_fee_per_day) || 0),
    }
    try {
      if (isEdit) {
        await updateMutation.mutateAsync(payload)
        toast("success", "Property updated.")
        navigate(`/properties/${id}`, { replace: true })
      } else {
        const created = await createMutation.mutateAsync(payload)
        toast("success", "Property created.")
        navigate(`/properties/${created.id}`, { replace: true })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong."
      setError(message)
      toast("error", message)
    }
  }

  const saving = createMutation.isPending || updateMutation.isPending
  const backTo = isEdit ? `/properties/${id}` : "/properties"

  if (isEdit && existing.isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96" />
      </div>
    )
  }

  if (isEdit && existing.error) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Couldn't load property: {(existing.error as Error).message}
      </p>
    )
  }

  const field = (
    key: keyof PropertyInput,
    label: string,
    placeholder?: string,
    opts?: { type?: string; required?: boolean }
  ) => (
    <div className="space-y-2">
      <Label htmlFor={key}>
        {label}
        {opts?.required && <span className="text-destructive"> *</span>}
      </Label>
      <Input
        id={key}
        type={opts?.type ?? "text"}
        placeholder={placeholder}
        value={(form[key] as string) ?? ""}
        onChange={(e) => set(key, e.target.value)}
        required={opts?.required}
      />
    </div>
  )

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        to={backTo}
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2")}
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Back
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>{isEdit ? "Edit property" : "Add property"}</CardTitle>
          <CardDescription>
            {isEdit
              ? "Changes update this property's details only. Tenant, rent and payment history are kept in separate records and are never affected."
              : "Start with the basics — you can add floors and flats right after."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {field("name", "Property name", "ABC Residency", { required: true })}
            <div className="grid gap-4 sm:grid-cols-2">
              {field("property_type", "Property type", "Apartment, Villa, …")}
              {field("floor_structure", "Floor structure", "G+2")}
            </div>
            {field("address", "Address", "Door no, street")}
            <div className="grid gap-4 sm:grid-cols-2">
              {field("area", "Area", "Madhapur")}
              {field("locality", "Locality", "Near bus stop")}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {field("landmark", "Landmark", "Opposite park")}
              {field("city", "City", "Hyderabad")}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {field("state", "State", "Telangana")}
              {field("pincode", "Pincode", "500081")}
            </div>
            {field("effective_date", "Effective date", undefined, {
              type: "date",
            })}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="A short description of the property"
                value={form.description ?? ""}
                onChange={(e) => set("description", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Private notes about this property"
                value={form.notes ?? ""}
                onChange={(e) => set("notes", e.target.value)}
              />
            </div>
            <div className="rounded-xl border p-4">
              <div className="flex items-center gap-2">
                <input
                  id="late-fee-enabled"
                  type="checkbox"
                  className="h-4 w-4 accent-indigo-600"
                  checked={Boolean(form.late_fee_enabled)}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, late_fee_enabled: e.target.checked }))
                  }
                />
                <Label htmlFor="late-fee-enabled" className="font-medium">
                  Enable late fee
                </Label>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                When enabled, new monthly bills automatically add a late fee if
                the previous month is still unpaid past the grace period.
              </p>
              {Boolean(form.late_fee_enabled) && (
                <div className="mt-3 grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="late-fee-grace">Grace days</Label>
                    <Input
                      id="late-fee-grace"
                      type="number"
                      min={0}
                      value={String(form.late_fee_grace_days ?? 5)}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, late_fee_grace_days: Number(e.target.value) || 0 }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="late-fee-fixed">Fixed fee (₹)</Label>
                    <Input
                      id="late-fee-fixed"
                      type="number"
                      min={0}
                      step="0.01"
                      value={String(form.late_fee_fixed ?? 0)}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, late_fee_fixed: Number(e.target.value) || 0 }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="late-fee-perday">Per day (₹)</Label>
                    <Input
                      id="late-fee-perday"
                      type="number"
                      min={0}
                      step="0.01"
                      value={String(form.late_fee_per_day ?? 0)}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, late_fee_per_day: Number(e.target.value) || 0 }))
                      }
                    />
                  </div>
                </div>
              )}
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Link to={backTo} className={buttonVariants({ variant: "outline" })}>
                Cancel
              </Link>
              <Button type="submit" disabled={saving}>
                {saving
                  ? "Saving…"
                  : isEdit
                    ? "Save changes"
                    : "Create property"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
