import { useState } from "react"
import { NavLink, Outlet, useNavigate } from "react-router-dom"
import {
  AlertCircle,
  BarChart3,
  Bell,
  Building2,
  CalendarCheck,
  DoorOpen,
  FileText,
  HeartHandshake,
  History,
  IndianRupee,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Receipt,
  Settings,
  Share2,
  Users,
  Wrench,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth"
import GlobalSearch from "@/components/search/GlobalSearch"

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/properties", label: "Properties", icon: Building2 },
  { to: "/available-flats", label: "Available Flats", icon: DoorOpen },
  { to: "/tenants", label: "Tenants", icon: Users },
  { to: "/due", label: "Due", icon: AlertCircle },
  { to: "/payments", label: "Payments", icon: IndianRupee },
  { to: "/expenses", label: "Expenses", icon: Receipt },
  { to: "/maintenance", label: "Maintenance", icon: Wrench },
  { to: "/agreements", label: "Agreements", icon: FileText },
  { to: "/listings", label: "Listings", icon: Megaphone },
  { to: "/interests", label: "Interested Tenants", icon: HeartHandshake },
  { to: "/visits", label: "Visits", icon: CalendarCheck },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/history", label: "History", icon: History },
  { to: "/shared", label: "Shared Properties", icon: Share2 },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/settings", label: "Settings", icon: Settings },
]

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
          R
        </div>
        <div>
          <p className="text-sm font-bold leading-none">RentTrack</p>
          <p className="text-[11px] text-muted-foreground">
            Track Every Property. Manage Every Rent.
          </p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )
                }
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="border-t p-4">
        <UserFooter />
        <p className="mt-3 text-xs text-muted-foreground">
          RentTrack · Phase 8 — marketplace.
        </p>
      </div>
    </div>
  )
}

function UserFooter() {
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
        <p className="text-xs text-muted-foreground">
          {profile?.role === "TENANT" ? "Tenant" : "Owner"}
        </p>
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

export default function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-muted/40">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r bg-card lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 bg-card shadow-xl">
            <button
              className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-accent"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center gap-3 border-b bg-card px-4 lg:px-6">
          <button
            className="rounded-md p-2 text-muted-foreground hover:bg-accent lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-semibold">Owner Console</h1>
          <div className="ml-auto hidden sm:block">
            <GlobalSearch />
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
