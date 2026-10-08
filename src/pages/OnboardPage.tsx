import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { CheckCircle2, Plus, Trash2, Upload } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import {
  completeOnboarding,
  uploadOnboardingAadhaar,
  validateOnboardingToken,
  type OnboardingFamilyInput,
  type OnboardingTenantInput,
  type ValidatedToken,
} from "@/hooks/useOnboarding"

const EMPTY_FAMILY: OnboardingFamilyInput = {
  name: "",
  relationship: "",
  dob: "",
  age: "",
  occupation: "",
  phone: "",
  aadhaar_number: "",
  notes: "",
}

/**
 * Public self-onboarding page (no login required).
 * The token is validated through a SECURITY DEFINER RPC; anonymous users
 * get no direct table access. Aadhaar uploads go to a token-scoped folder
 * guarded by a storage policy that only accepts live tokens.
 */
export default function OnboardPage() {
  const { token } = useParams<{ token: string }>()
  const { toast } = useToast()
  const [checking, setChecking] = useState(true)
  const [validated, setValidated] = useState<ValidatedToken | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const [tenant, setTenant] = useState<OnboardingTenantInput>({
    full_name: "",
    primary_phone: "",
    address: "",
    occupation: "",
    place_of_work: "",
    notes: "",
  })
  const [family, setFamily] = useState<OnboardingFamilyInput[]>([])
  const [frontFile, setFrontFile] = useState<File | null>(null)
  const [backFile, setBackFile] = useState<File | null>(null)

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!token) {
        setChecking(false)
        return
      }
      try {
        const v = await validateOnboardingToken(token)
        if (!cancelled) setValidated(v)
      } catch {
        if (!cancelled) setValidated({ valid: false, reason: "validation failed" })
      } finally {
        if (!cancelled) setChecking(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [token])

  function setT(key: keyof OnboardingTenantInput, value: string) {
    setTenant((t) => ({ ...t, [key]: value }))
  }

  function setF(index: number, key: keyof OnboardingFamilyInput, value: string) {
    setFamily((fs) => fs.map((f, i) => (i === index ? { ...f, [key]: value } : f)))
  }

  async function handleSubmit() {
    if (!token || !validated?.valid) return
    if (!tenant.full_name.trim()) {
      toast("error", "Please enter your full name.")
      return
    }
    setSubmitting(true)
    try {
      let frontPath: string | null = null
      let backPath: string | null = null
      if (frontFile) {
        frontPath = await uploadOnboardingAadhaar(token, "front", frontFile)
      }
      if (backFile) {
        backPath = await uploadOnboardingAadhaar(token, "back", backFile)
      }
      await completeOnboarding({
        token,
        tenant,
        family,
        aadhaarFrontPath: frontPath,
        aadhaarBackPath: backPath,
      })
      setDone(true)
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Submission failed. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  if (checking) {
    return (
      <div className="mx-auto max-w-xl space-y-4 p-6">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (!validated?.valid) {
    const reason =
      validated?.reason === "expired"
        ? "This link has expired. Please ask the property owner for a new one."
        : validated?.reason === "already used"
          ? "This link has already been used."
          : "This onboarding link is not valid. Please check the link or ask the property owner for a new one."
    return (
      <div className="mx-auto max-w-xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Link not valid</CardTitle>
            <CardDescription>{reason}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  if (done) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-600" />
            <h1 className="text-xl font-bold">Details submitted</h1>
            <p className="max-w-sm text-sm text-muted-foreground">
              Thank you, {tenant.full_name.trim()}. The property owner has been
              notified and will review your details. They will contact you about
              the tenancy.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-indigo-700">RentTrack</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tenant onboarding — {validated.property_name}
          {validated.flat_number ? ` · Flat ${validated.flat_number}` : ""}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Fill in your details below. Your Aadhaar is stored securely and only
          visible to the property owner.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="ob-name">Full name *</Label>
            <Input
              id="ob-name"
              className="mt-1"
              value={tenant.full_name}
              onChange={(e) => setT("full_name", e.target.value)}
              placeholder="Your full name"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="ob-phone">Phone</Label>
              <Input
                id="ob-phone"
                className="mt-1"
                inputMode="tel"
                value={tenant.primary_phone}
                onChange={(e) => setT("primary_phone", e.target.value)}
                placeholder="98765 43210"
              />
            </div>
            <div>
              <Label htmlFor="ob-occupation">Occupation</Label>
              <Input
                id="ob-occupation"
                className="mt-1"
                value={tenant.occupation}
                onChange={(e) => setT("occupation", e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="ob-address">Address</Label>
            <Textarea
              id="ob-address"
              className="mt-1"
              rows={2}
              value={tenant.address}
              onChange={(e) => setT("address", e.target.value)}
              placeholder="Current address"
            />
          </div>
          <div>
            <Label htmlFor="ob-work">Place of work</Label>
            <Input
              id="ob-work"
              className="mt-1"
              value={tenant.place_of_work}
              onChange={(e) => setT("place_of_work", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Aadhaar</CardTitle>
          <CardDescription>
            Upload front and back photos. Stored privately, never shared.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="ob-afront">Aadhaar front</Label>
            <Input
              id="ob-afront"
              type="file"
              accept="image/*"
              className="mt-1"
              onChange={(e) => setFrontFile(e.target.files?.[0] ?? null)}
            />
            {frontFile && (
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Upload className="h-3 w-3" /> {frontFile.name}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="ob-aback">Aadhaar back</Label>
            <Input
              id="ob-aback"
              type="file"
              accept="image/*"
              className="mt-1"
              onChange={(e) => setBackFile(e.target.files?.[0] ?? null)}
            />
            {backFile && (
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Upload className="h-3 w-3" /> {backFile.name}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Family members</CardTitle>
          <CardDescription>People who will stay with you (optional).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {family.map((f, i) => (
            <div key={i} className="rounded-xl border p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">Member {i + 1}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFamily((fs) => fs.filter((_, j) => j !== i))}
                  aria-label="Remove member"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  placeholder="Name *"
                  value={f.name}
                  onChange={(e) => setF(i, "name", e.target.value)}
                />
                <Input
                  placeholder="Relationship"
                  value={f.relationship}
                  onChange={(e) => setF(i, "relationship", e.target.value)}
                />
                <Input
                  placeholder="Phone"
                  value={f.phone}
                  onChange={(e) => setF(i, "phone", e.target.value)}
                />
                <Input
                  placeholder="Aadhaar number"
                  value={f.aadhaar_number}
                  onChange={(e) => setF(i, "aadhaar_number", e.target.value)}
                />
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setFamily((fs) => [...fs, { ...EMPTY_FAMILY }])}>
            <Plus className="mr-1 h-4 w-4" /> Add family member
          </Button>
        </CardContent>
      </Card>

      <Button
        className="w-full"
        size="lg"
        onClick={() => void handleSubmit()}
        disabled={submitting}
      >
        {submitting ? "Submitting…" : "Submit details"}
      </Button>
      <p className="pb-6 text-center text-xs text-muted-foreground">
        By submitting, you share these details with the property owner for tenancy processing.
      </p>
    </div>
  )
}
