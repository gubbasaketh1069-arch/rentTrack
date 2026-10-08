import type { ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { UserX } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/lib/auth"
import { useMyTenant } from "@/hooks/useTenantPortal"
import {
  useTenantActiveTenancy,
  type Tenant,
  type Tenancy,
} from "@/hooks/useTenantData"

export interface GateData {
  tenant: Tenant
  tenancy: Tenancy | null
  tenancyLoading: boolean
}

function PageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-56" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-48" />
    </div>
  )
}

/**
 * Resolves the logged-in tenant and their active tenancy for portal pages.
 * If the login isn't linked to a tenants row yet, shows an honest
 * "not linked" state instead of an empty portal.
 */
export default function TenantGate({
  children,
}: {
  children: (data: GateData) => ReactNode
}) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const myTenant = useMyTenant()
  const tenancy = useTenantActiveTenancy(myTenant.data?.id)

  if (myTenant.isLoading || !user) return <PageSkeleton />

  if (myTenant.error) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Couldn't load your tenant record: {(myTenant.error as Error).message}
      </p>
    )
  }

  if (!myTenant.data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <UserX className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="max-w-sm text-sm font-medium">
            Your login isn't linked to a tenant record yet
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Ask your property owner to link your account — they'll need the
            email address you signed up with
            {user.email ? (
              <>
                {" "}(<span className="font-medium text-foreground">{user.email}</span>)
              </>
            ) : (
              ""
            )}
            .
          </p>
          <button
            type="button"
            onClick={async () => {
              await signOut()
              navigate("/login", { replace: true })
            }}
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Switch account
          </button>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      {children({
        tenant: myTenant.data,
        tenancy: tenancy.data ?? null,
        tenancyLoading: tenancy.isLoading,
      })}
    </>
  )
}
