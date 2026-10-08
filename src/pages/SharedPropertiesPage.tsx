import { Link } from "react-router-dom"
import { Building2, Check, MailOpen, Share2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import { useSharedProperties } from "@/hooks/usePropertyData"
import {
  useAcceptInvitation,
  useDeclineInvitation,
  useMyInvitations,
} from "@/hooks/useMarketplace"
import { locationLine } from "@/lib/format"

/**
 * Shared Properties (spec sections 42-43): properties other owners shared
 * with me, plus pending invitations I can accept or decline. Accepting
 * works on the SAME property records — nothing is duplicated.
 */
export default function SharedPropertiesPage() {
  const { toast } = useToast()
  const shared = useSharedProperties()
  const invites = useMyInvitations()
  const accept = useAcceptInvitation()
  const decline = useDeclineInvitation()

  async function handleAccept(id: string) {
    try {
      await accept.mutateAsync(id)
      toast("success", "Invitation accepted — the property is now in your shared list.")
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Couldn't accept the invitation.")
    }
  }

  async function handleDecline(id: string) {
    try {
      await decline.mutateAsync(id)
      toast("success", "Invitation declined.")
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Couldn't decline the invitation.")
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Shared Properties</h2>
        <p className="text-sm text-muted-foreground">
          Properties other owners gave you access to. You work on the same
          records — nothing is copied.
        </p>
      </div>

      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <MailOpen className="h-4 w-4" /> Pending invitations
        </h3>
        {invites.isLoading ? (
          <Skeleton className="h-20" />
        ) : (invites.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No pending invitations. When someone shares a property with your
            email, it'll show up here.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {(invites.data ?? []).map((inv) => (
              <Card key={inv.id}>
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {inv.property?.name ?? "A property"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Invited as <Badge variant="info">{inv.role}</Badge>
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleAccept(inv.id)}
                      disabled={accept.isPending}
                    >
                      <Check className="mr-1 h-3.5 w-3.5" /> Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDecline(inv.id)}
                      disabled={decline.isPending}
                    >
                      <X className="mr-1 h-3.5 w-3.5" /> Decline
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Share2 className="h-4 w-4" /> Properties shared with you
        </h3>
        {shared.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        ) : (shared.data ?? []).length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <Building2 className="h-8 w-8 text-muted-foreground" />
              <p className="max-w-sm text-sm text-muted-foreground">
                Nothing shared yet. Ask the property owner to invite your email
                from the property's Sharing section.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {(shared.data ?? []).map((p) => (
              <Link key={p.id} to={`/properties/${p.id}`}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
                    <div>
                      <CardTitle className="text-base leading-tight">
                        {p.name}
                      </CardTitle>
                      <CardDescription className="mt-0.5 text-xs">
                        {locationLine(p.locality, p.area, p.city)}
                      </CardDescription>
                    </div>
                    <Badge variant="info" className="shrink-0">
                      {p.member_role}
                    </Badge>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
