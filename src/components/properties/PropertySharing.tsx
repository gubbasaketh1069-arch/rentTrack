import { useState } from "react"
import { MailPlus, ShieldCheck, Trash2, UserMinus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/toast"
import {
  useInvitations,
  useMyPropertyRole,
  usePropertyMembers,
  useRemoveMember,
  useRevokeInvitation,
  useSendInvitation,
  type MemberRole,
} from "@/hooks/useMarketplace"
import { useAuth } from "@/lib/auth"
import { cn } from "@/lib/utils"

const SHAREABLE_ROLES: MemberRole[] = ["CO_OWNER", "MANAGER", "EDITOR", "VIEWER"]

const ROLE_BLURB: Record<MemberRole, string> = {
  PRIMARY_OWNER: "Full control, including deleting the property.",
  CO_OWNER: "Almost everything except deleting the property.",
  MANAGER: "Day-to-day operations: tenants, billing, maintenance, listings.",
  EDITOR: "Can add and edit records, can't manage members or delete.",
  VIEWER: "Read-only access.",
}

/** Everyone works on the SAME records — sharing never duplicates the property. */
export default function PropertySharing({ propertyId }: { propertyId: string }) {
  const { toast } = useToast()
  const { user } = useAuth()
  const roleQuery = useMyPropertyRole(propertyId)
  const membersQuery = usePropertyMembers(propertyId)
  const invitesQuery = useInvitations(propertyId)
  const sendInvite = useSendInvitation(propertyId)
  const revokeInvite = useRevokeInvitation(propertyId)
  const removeMember = useRemoveMember(propertyId)

  const [email, setEmail] = useState("")
  const [role, setRole] = useState<MemberRole>("MANAGER")
  const [revoking, setRevoking] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const myRole = roleQuery.data
  const canManage =
    myRole === "OWNER" ||
    myRole === "PRIMARY_OWNER" ||
    myRole === "CO_OWNER" ||
    myRole === "MANAGER"

  async function handleInvite() {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed || !trimmed.includes("@")) {
      setError("Enter a valid email address.")
      return
    }
    setError(null)
    try {
      await sendInvite.mutateAsync({ email: trimmed, role })
      setEmail("")
      toast("success", "Invitation sent.")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send the invitation.")
    }
  }

  async function handleRevoke(id: string) {
    try {
      await revokeInvite.mutateAsync(id)
      toast("success", "Invitation revoked.")
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Couldn't revoke the invitation.")
    } finally {
      setRevoking(null)
    }
  }

  async function handleRemove(memberId: string) {
    try {
      await removeMember.mutateAsync(memberId)
      toast("success", "Access removed. The property data is untouched.")
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Couldn't remove access.")
    } finally {
      setRemoving(null)
    }
  }

  const pendingInvites = (invitesQuery.data ?? []).filter(
    (i) => i.status === "PENDING"
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" /> Sharing
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {membersQuery.isLoading ? (
          <Skeleton className="h-16" />
        ) : (
          <div className="space-y-2">
            {(membersQuery.data ?? []).map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {m.profile?.full_name || m.profile?.email || "Member"}
                    {m.user_id === user?.id && (
                      <span className="text-muted-foreground"> (you)</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.profile?.email}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="info">{m.role}</Badge>
                  {canManage && m.user_id !== user?.id && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setRemoving(m.id)}
                      title="Remove access (data is kept)"
                    >
                      <UserMinus className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {(membersQuery.data ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">
                Only you have access to this property.
              </p>
            )}
          </div>
        )}

        {canManage && (
          <>
            {pendingInvites.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Pending invitations</p>
                {pendingInvites.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm">{inv.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Invited as {inv.role}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setRevoking(inv.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3 rounded-lg bg-muted/50 p-3">
              <p className="flex items-center gap-2 text-sm font-medium">
                <MailPlus className="h-4 w-4" /> Invite someone
              </p>
              <div className="grid gap-3 sm:grid-cols-[1fr_160px_auto]">
                <div>
                  <Label>Email</Label>
                  <Input
                    className="mt-1"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="partner@example.com"
                  />
                </div>
                <div>
                  <Label>Role</Label>
                  <select
                    className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={role}
                    onChange={(e) => setRole(e.target.value as MemberRole)}
                  >
                    {SHAREABLE_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={handleInvite}
                    disabled={sendInvite.isPending}
                    className={cn("w-full sm:w-auto")}
                  >
                    Send invite
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{ROLE_BLURB[role]}</p>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <p className="text-xs text-muted-foreground">
                They need a RentTrack account with that email. Once they accept,
                the property appears under their Shared Properties.
              </p>
            </div>
          </>
        )}

        <Dialog
          open={!!revoking}
          onClose={() => setRevoking(null)}
          title="Revoke invitation?"
          description="The person won't be able to accept it anymore."
        >
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRevoking(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => revoking && handleRevoke(revoking)}
              disabled={revokeInvite.isPending}
            >
              Revoke
            </Button>
          </div>
        </Dialog>

        <Dialog
          open={!!removing}
          onClose={() => setRemoving(null)}
          title="Remove access?"
          description="They'll lose access immediately, but no property data is deleted."
        >
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => removing && handleRemove(removing)}
              disabled={removeMember.isPending}
            >
              Remove access
            </Button>
          </div>
        </Dialog>
      </CardContent>
    </Card>
  )
}
