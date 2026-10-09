import { useState } from "react"
import { NavLink, Outlet, useNavigate } from "react-router-dom"
import {
  AlertCircle,
  Bell,
  CreditCard,
  DoorOpen,
  FileSignature,
  FileText,
  Heart,
  Home,
  IndianRupee,
  LogOut,
  MoreHorizontal,
  Receipt,
  Search,
  User,
  Wrench,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { useMyNotifications } from "@/hooks/useTenantPortal"

const NAV_ITEMS = [
  { to: "/home", label: "Dashboard", icon: Home, end: true },
  { to: "/home/flat", label: "My Flat", icon: DoorOpen },
  { to: "/home/find-flat", label: "Find a Flat", icon: Search },
  { to: "/home/bills", label: "Rent & Bills", icon: Receipt },
  { to: "/home/payments", label: "Payments", icon: IndianRupee },
  { to: "/home/autopay", label: "Autopay", icon: CreditCard },
  { to: "/home/saved", label: "Saved Flats", icon: Heart },
  { to: "/home/due", label: "Due", icon: AlertCircle },
  { to: "/home/maintenance", label: "Maintenance", icon: Wrench },
  { to: "/home/documents", label: "Documents", icon: FileText },
  { to: "/home/agreement", label: "Agreement", icon: FileSignature },
  { to: "/home/profile", label: "Profile", icon: User },
  { to: "/home/notifications", label: "Notifications", icon: Bell },
]

/** Primary tabs shown in the mobile bottom bar; the rest live under "More". */
const TAB_ITEMS = NAV_ITEMS.slice(0, 4)
const MORE_ITEMS = NAV_ITEMS.slice(4)

function useUnreadCount() {
  const { data } = useMyNotifications()
  return (data ?? []).filter((n) => !n.is_read).length
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const unread = useUnreadCount()
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-sm font-bold text-white shadow-sm">
          R
        </div>
        <div>
          <p className="text-sm font-bold leading-none">RentTrack</p>
          <p className="text-[11px] text-muted-foreground">Tenant Portal</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors",
                    isActive
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm shadow-blue-200"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )
                }
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
                {item.to === "/home/notifications" && unread > 0 && (
                  <span className="ml-auto rounded-full bg-status-due px-2 py-0.5 text-[11px] font-semibold text-white">
                    {unread}
                  </span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="border-t p-4">
        <TenantFooter />
      </div>
    </div>
  )
}

function TenantFooter() {
  const { profile, user, signOut } = useAuth()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
    navigate("/login", { replace: true })
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {profile?.full_name || user?.email || "Account"}
        </p>
        <p className="text-xs text-muted-foreground">Tenant</p>
      </div>
      <button
        onClick={handleSignOut}
        disabled={signingOut}
        aria-label="Sign out"
        title="Sign out"
        className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  )
}

function MobileTabBar() {
  const [moreOpen, setMoreOpen] = useState(false)
  const unread = useUnreadCount()
  const { signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    setMoreOpen(false)
    await signOut()
    navigate("/login", { replace: true })
  }

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card lg:hidden">
        <div className="grid grid-cols-5">
          {TAB_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px]",
                  isActive
                    ? "font-bold text-primary"
                    : "font-medium text-muted-foreground"
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground"
          >
            <MoreHorizontal className="h-5 w-5" />
            More
          </button>
        </div>
      </nav>
      <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="grid gap-1">
          {MORE_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMoreOpen(false)}
              className="flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
              {item.to === "/home/notifications" && unread > 0 && (
                <span className="ml-auto rounded-full bg-status-due px-2 py-0.5 text-[11px] font-semibold text-white">
                  {unread}
                </span>
              )}
            </NavLink>
          ))}
          <Button
            variant="ghost"
            className="justify-start gap-3 px-3"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign out
          </Button>
        </div>
      </Dialog>
    </>
  )
}

/**
 * Tenant portal shell: desktop sidebar, mobile bottom tab bar.
 * Strictly separate from the owner console — no owner routes or data here.
 */
export default function TenantShell() {
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 border-r bg-card lg:block">
        <SidebarContent />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center gap-3 border-b bg-card px-4 lg:px-6">
          <h1 className="text-lg font-semibold">My Home</h1>
        </header>
        <main className="flex-1 p-4 pb-24 lg:p-6 lg:pb-6">
          <Outlet />
        </main>
      </div>

      <MobileTabBar />
    </div>
  )
}
