import { useMemo, useState } from "react"
import { format, parseISO } from "date-fns"
import { History as HistoryIcon } from "lucide-react"
import { useActivityLogs } from "@/hooks/useReports"
import { ACTIVITY_LABELS } from "@/lib/activity"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"

export default function HistoryPage() {
  const [search, setSearch] = useState("")
  const { data, isLoading, error } = useActivityLogs(300)

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data ?? []).filter((r) => {
      if (!q) return true
      const label = (ACTIVITY_LABELS[r.action] ?? r.action).toLowerCase()
      const actor = `${(r.actor as { full_name?: string } | null)?.full_name ?? ""} ${(r.actor as { email?: string } | null)?.email ?? ""}`.toLowerCase()
      const prop = ((r.property as { name?: string } | null)?.name ?? "").toLowerCase()
      return label.includes(q) || actor.includes(q) || prop.includes(q) || (r.entity ?? "").toLowerCase().includes(q)
    })
  }, [data, search])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">History</h1>
        <p className="text-sm text-muted-foreground">
          Who did what, and when — across your properties.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HistoryIcon className="h-4 w-4" /> Activity log
          </CardTitle>
          <CardDescription>Newest first. Key actions are recorded automatically.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Filter by action, person, property…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">Couldn't load history: {(error as Error).message}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No activity yet. Actions like adding tenants, recording payments and changing rent are logged here automatically.
            </p>
          ) : (
            <div className="divide-y rounded-md border">
              {rows.map((r) => {
                const actor = r.actor as { full_name?: string; email?: string } | null
                const prop = r.property as { name?: string } | null
                let when = "—"
                try {
                  when = format(parseISO(r.created_at), "dd MMM yyyy, h:mm a")
                } catch { /* keep — */ }
                return (
                  <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                    <Badge variant="outline">{ACTIVITY_LABELS[r.action] ?? r.action}</Badge>
                    <span className="text-sm font-medium">{actor?.full_name ?? actor?.email ?? "Someone"}</span>
                    {r.entity && (
                      <span className="text-sm text-muted-foreground">{r.entity}</span>
                    )}
                    {prop?.name && (
                      <span className="text-xs text-muted-foreground">· {prop.name}</span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">{when}</span>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
