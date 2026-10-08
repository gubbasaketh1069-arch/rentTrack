import { Bell } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useMarkNotificationsRead, useMyNotifications } from "@/hooks/useTenantPortal"
import { cn } from "@/lib/utils"

function NotificationsBody() {
  const list = useMyNotifications()
  const markRead = useMarkNotificationsRead()

  if (list.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    )
  }

  if (list.error) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Couldn't load notifications: {(list.error as Error).message}
      </p>
    )
  }

  const items = list.data ?? []
  const unreadIds = items.filter((n) => !n.is_read).map((n) => n.id)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Notifications</h2>
        {unreadIds.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            disabled={markRead.isPending}
            onClick={() => markRead.mutate(unreadIds)}
          >
            Mark all read
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Bell className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="max-w-sm text-sm text-muted-foreground">
              No notifications yet. Rent reminders and payment confirmations
              will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {items.map((n) => (
            <Card key={n.id} className={cn(!n.is_read && "border-primary/40")}>
              <CardContent className="flex gap-3 py-3.5">
                {!n.is_read && (
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium">{n.title}</p>
                  {n.body && <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(n.created_at).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

/** Tenant's own notifications, read-only (sending is a later phase). */
export default function TenantNotificationsPage() {
  return <NotificationsBody />
}
