import { useState } from "react"
import { Link2, Unlink } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { ConfirmDialog } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/toast"
import { useLinkTenantLogin, useUnlinkTenantLogin } from "@/hooks/useTenantPortal"
import type { Tenant } from "@/hooks/useTenantData"

/**
 * Owner-side: link a tenant's portal login (their signup email) to this
 * tenants row via the link_tenant_login() RPC. Without a link the tenant
 * can't see the portal.
 */
export default function LinkLoginCard({ tenant }: { tenant: Tenant }) {
  const { toast } = useToast()
  const [email, setEmail] = useState("")
  const [confirmUnlink, setConfirmUnlink] = useState(false)
  const link = useLinkTenantLogin(tenant.id)
  const unlink = useUnlinkTenantLogin(tenant.id)

  async function handleLink() {
    const value = email.trim()
    if (!value) {
      toast("error", "Enter the email the tenant signed up with.")
      return
    }
    try {
      await link.mutateAsync(value)
      setEmail("")
      toast("success", "Tenant login linked — the portal is now active for them.")
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Couldn't link the login.")
    }
  }

  async function handleUnlink() {
    try {
      await unlink.mutateAsync()
      setConfirmUnlink(false)
      toast("success", "Tenant login unlinked.")
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Couldn't unlink the login.")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Portal login</CardTitle>
        <CardDescription>
          Link the tenant's own RentTrack login so they can use the tenant portal.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {tenant.user_id ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Badge variant="paid">Linked</Badge>
              <p className="text-sm text-muted-foreground">
                This tenant can sign in and use the portal.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmUnlink(true)}
            >
              <Unlink className="mr-1 h-4 w-4" /> Unlink
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="link-email">Tenant's signup email</Label>
              <Input
                id="link-email"
                type="email"
                placeholder="tenant@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleLink()
                }}
              />
              <p className="text-xs text-muted-foreground">
                The tenant must have signed up with the Tenant account type first.
              </p>
            </div>
            <Button size="sm" onClick={handleLink} disabled={link.isPending}>
              <Link2 className="mr-1 h-4 w-4" />
              {link.isPending ? "Linking…" : "Link login"}
            </Button>
          </div>
        )}
      </CardContent>
      <ConfirmDialog
        open={confirmUnlink}
        onClose={() => setConfirmUnlink(false)}
        title="Unlink tenant login?"
        message="The tenant will no longer be able to sign in to the portal. Their tenancy and history are kept."
        confirmLabel="Unlink"
        confirming={unlink.isPending}
        onConfirm={handleUnlink}
      />
    </Card>
  )
}
