import { Navigate, Outlet, useLocation } from "react-router-dom"
import { useAuth } from "@/lib/auth"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Gates the app shell: unauthenticated visitors go to /login.
 * While the session/profile resolves, a skeleton is shown instead of
 * flashing protected content.
 */
export default function ProtectedRoute() {
  const location = useLocation()
  const { user, authReady, profileLoading, profileError } = useAuth()

  if (!authReady) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (profileLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-28" />
      </div>
    )
  }

  if (profileError) {
    return (
      <div className="mx-auto max-w-md p-6">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">
            Couldn't load your profile
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{profileError}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Your login worked, but the profile record is missing. This usually
            means the auth trigger migration hasn't been run yet in Supabase.
          </p>
        </div>
      </div>
    )
  }

  return <Outlet />
}
