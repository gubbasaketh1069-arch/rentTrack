import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import TenantGate from "@/components/portal/TenantGate"
import { useCreateMandate, useMyMandates, useUpdateMandateStatus } from "@/hooks/useAutopay"
import {
  isUpiConfigured,
  isValidUpiId,
  MANDATE_STATUS_LABELS,
  PAYMENT_PROVIDERS,
  type PaymentProvider,
  type UpiMandate,
} from "@/lib/autopay"

function SetupForm({
  tenantId,
  propertyId,
  tenancyId,
  onDone,
}: {
  tenantId: string
  propertyId: string
  tenancyId: string | null
  onDone: () => void
}) {
  const { toast } = useToast()
  const createMandate = useCreateMandate()
  const [upiId, setUpiId] = useState("")
  const [maxAmount, setMaxAmount] = useState("")
  const [provider, setProvider] = useState<PaymentProvider>("RAZORPAY")
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    setError(null)
    if (!isValidUpiId(upiId)) {
      setError("Enter a valid UPI ID (e.g. name@okhdfc).")
      return
    }
    if (!(Number(maxAmount) > 0)) {
      setError("Enter a max monthly amount greater than zero.")
      return
    }
    try {
      await createMandate.mutateAsync({
        tenantId,
        propertyId,
        tenancyId,
        provider,
        upiId,
        maxAmount: Number(maxAmount),
      })
      toast("success", "Mandate request saved.")
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the mandate.")
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="ap-upi">UPI ID *</Label>
        <Input
          id="ap-upi"
          className="mt-1"
          placeholder="name@okhdfc"
          value={upiId}
          onChange={(e) => setUpiId(e.target.value)}
          inputMode="email"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="ap-max">Max amount per month (₹) *</Label>
          <Input
            id="ap-max"
            type="number"
            min="0"
            step="0.01"
            className="mt-1"
            placeholder="9000"
            value={maxAmount}
            onChange={(e) => setMaxAmount(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="ap-provider">Provider</Label>
          <select
            id="ap-provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value as PaymentProvider)}
            className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {PAYMENT_PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {p.charAt(0) + p.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button onClick={handleSubmit} disabled={createMandate.isPending}>
        {createMandate.isPending ? "Saving…" : "Set up autopay"}
      </Button>
    </div>
  )
}

function MandateRow({ mandate }: { mandate: UpiMandate }) {
  const { toast } = useToast()
  const updateStatus = useUpdateMandateStatus()

  async function handle(to: "PAUSED" | "ACTIVE" | "CANCELLED") {
    try {
      await updateStatus.mutateAsync({ mandate, to })
      toast("success", `Mandate ${to === "ACTIVE" ? "resumed" : to === "PAUSED" ? "paused" : "cancelled"}.`)
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not update.")
    }
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
      <div>
        <p className="font-medium">
          {mandate.provider} · {mandate.upi_id}
        </p>
        <p className="text-muted-foreground">
          Up to ₹{Number(mandate.max_amount).toFixed(2)}/month
          {mandate.next_debit_date ? ` · next debit ${mandate.next_debit_date}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={mandate.status === "ACTIVE" ? "available" : "neutral"}>
          {MANDATE_STATUS_LABELS[mandate.status] ?? mandate.status}
        </Badge>
        {mandate.status === "ACTIVE" && (
          <Button variant="ghost" size="sm" disabled={updateStatus.isPending} onClick={() => handle("PAUSED")}>
            Pause
          </Button>
        )}
        {mandate.status === "PAUSED" && (
          <Button variant="ghost" size="sm" disabled={updateStatus.isPending} onClick={() => handle("ACTIVE")}>
            Resume
          </Button>
        )}
        {(mandate.status === "ACTIVE" || mandate.status === "PAUSED" || mandate.status === "PENDING_SETUP") && (
          <Button variant="ghost" size="sm" disabled={updateStatus.isPending} onClick={() => handle("CANCELLED")}>
            Cancel
          </Button>
        )}
      </div>
    </li>
  )
}

/**
 * Tenant portal: UPI autopay (added feature B).
 * Honest until a provider is connected — mandates are stored as
 * PENDING_SETUP and the page says plainly that automatic debits are not
 * live yet.
 */
export default function TenantAutopayPage() {
  return (
    <TenantGate>
      {({ tenant, tenancy, tenancyLoading }) => {
        if (tenancyLoading) return <Skeleton className="h-48" />
        if (!tenancy) {
          return (
            <div className="space-y-4">
              <h2 className="text-xl font-bold">UPI Autopay</h2>
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    No active tenancy — autopay is available once you have one.
                  </p>
                </CardContent>
              </Card>
            </div>
          )
        }
        return <AutopayContent tenantId={tenant.id} propertyId={tenancy.property_id} tenancyId={tenancy.id} />
      }}
    </TenantGate>
  )
}

function AutopayContent({
  tenantId,
  propertyId,
  tenancyId,
}: {
  tenantId: string
  propertyId: string
  tenancyId: string
}) {
  const [settingUp, setSettingUp] = useState(false)
  const mandates = useMyMandates(tenantId)

  if (mandates.isLoading) return <Skeleton className="h-48" />

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">UPI Autopay</h2>

      {!isUpiConfigured() && (
        <Card className="border-amber-500/50">
          <CardHeader>
            <CardTitle className="text-base">Automatic debits aren't live yet</CardTitle>
            <CardDescription>
              Your owner hasn't connected a payment provider. You can still
              register your UPI details — the mandate stays pending and no
              money moves until the provider is connected and confirms it.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">My mandates</CardTitle>
          <CardDescription>
            Monthly rent debits, authorized by you. Pause or cancel anytime.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mandates.error ? (
            <p className="text-sm text-destructive" role="alert">
              Couldn't load mandates: {(mandates.error as Error).message}
            </p>
          ) : (mandates.data ?? []).length === 0 && !settingUp ? (
            <div className="flex flex-col items-start gap-3 py-4">
              <p className="text-sm text-muted-foreground">No autopay mandate yet.</p>
              <Button onClick={() => setSettingUp(true)}>Set up autopay</Button>
            </div>
          ) : (
            <ul className="space-y-2">
              {(mandates.data ?? []).map((m) => (
                <MandateRow key={m.id} mandate={m} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {settingUp && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New mandate</CardTitle>
            <CardDescription>
              {isUpiConfigured()
                ? "Your bank will ask you to approve the mandate."
                : "Saved as pending — your owner connects the payment provider before any debit can happen."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SetupForm
              tenantId={tenantId}
              propertyId={propertyId}
              tenancyId={tenancyId}
              onDone={() => setSettingUp(false)}
            />
          </CardContent>
        </Card>
      )}

      {!settingUp && (mandates.data ?? []).length > 0 && (
        <Button variant="outline" onClick={() => setSettingUp(true)}>
          Add another mandate
        </Button>
      )}
    </div>
  )
}
