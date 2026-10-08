import { useState } from "react"
import { Check, Copy, Link2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import {
  onboardingLink,
  useCreateOnboardingToken,
  useOnboardingTokens,
  useRevokeOnboardingToken,
} from "@/hooks/useOnboarding"

interface Props {
  open: boolean
  onClose: () => void
  propertyId: string
  flatId: string
  flatNumber: string
}

/**
 * Owner: generate single-use self-onboarding links for an AVAILABLE flat.
 * The tenant fills their own details + uploads Aadhaar; the owner then
 * creates the tenancy from the existing tenant record (no duplicates).
 */
export default function OnboardingLinkDialog({
  open,
  onClose,
  propertyId,
  flatId,
  flatNumber,
}: Props) {
  const { toast } = useToast()
  const tokens = useOnboardingTokens(open ? flatId : undefined)
  const createToken = useCreateOnboardingToken()
  const revokeToken = useRevokeOnboardingToken()
  const [daysValid, setDaysValid] = useState("7")
  const [copied, setCopied] = useState<string | null>(null)

  async function handleCreate() {
    const days = Math.min(90, Math.max(1, Number(daysValid) || 7))
    try {
      await createToken.mutateAsync({ propertyId, flatId, daysValid: days })
      toast("success", "Onboarding link created. Share it with the tenant.")
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not create link.")
    }
  }

  async function handleCopy(token: string) {
    try {
      await navigator.clipboard.writeText(onboardingLink(token))
      setCopied(token)
      setTimeout(() => setCopied(null), 2000)
      toast("success", "Link copied to clipboard.")
    } catch {
      toast("error", "Could not copy. Select the link text manually.")
    }
  }

  async function handleRevoke(id: string) {
    if (!window.confirm("Revoke this onboarding link? It will stop working immediately.")) return
    try {
      await revokeToken.mutateAsync({ id, flatId })
      toast("success", "Link revoked.")
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not revoke link.")
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Self-onboarding link — Flat ${flatNumber}`}
      description="The tenant opens this link (no login needed), fills their details and uploads Aadhaar. You review and create the tenancy afterwards."
    >
      <div className="flex items-end gap-2">
        <div className="w-32">
          <Label htmlFor="ob-days">Valid for (days)</Label>
          <Input
            id="ob-days"
            type="number"
            min={1}
            max={90}
            value={daysValid}
            onChange={(e) => setDaysValid(e.target.value)}
            className="mt-1"
          />
        </div>
        <Button onClick={() => void handleCreate()} disabled={createToken.isPending}>
          <Link2 className="mr-1 h-4 w-4" />
          {createToken.isPending ? "Creating…" : "Create link"}
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        {tokens.isLoading ? (
          <Skeleton className="h-16" />
        ) : (tokens.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active links. Create one above and share it with the tenant.
          </p>
        ) : (
          (tokens.data ?? []).map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-2 rounded-xl border p-3"
            >
              <div className="min-w-0">
                <p className="truncate font-mono text-xs">{onboardingLink(t.token)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Expires {new Date(t.expires_at).toLocaleDateString("en-IN")} · single use
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleCopy(t.token)}
                  aria-label="Copy link"
                >
                  {copied === t.token ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleRevoke(t.id)}
                  disabled={revokeToken.isPending}
                  aria-label="Revoke link"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </Dialog>
  )
}
