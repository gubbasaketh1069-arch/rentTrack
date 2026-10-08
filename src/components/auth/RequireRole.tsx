import { Navigate, Outlet } from "react-router-dom"
import { useAuth } from "@/lib/auth"
import { Skeleton } from "@/components/ui/skeleton"

interface Props {
  role: "OWNER" | "TENANT"
  /** Where to send a user whose role doesn't match. */
  fallback: string
}

/**
 * Role gate inside the protected area: owners never see the tenant portal
 * and tenants never see the owner console.
 */
export default function RequireRole({ role, fallback }: Props) {
  const { profile, profileLoading } = useAuth()

  if (profileLoading || !profile) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-28" />
      </div>
    )
  }

  if (profile.role !== role) {
    return <Navigate to={fallback} replace />
  }

  return <Outlet />
}
