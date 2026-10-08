import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AuthProvider, useAuth } from "@/lib/auth"
import { ToastProvider } from "@/components/ui/toast"
import ProtectedRoute from "@/components/auth/ProtectedRoute"
import RequireRole from "@/components/auth/RequireRole"
import AppShell from "@/components/layout/AppShell"
import TenantShell from "@/components/layout/TenantShell"
import { Skeleton } from "@/components/ui/skeleton"
import DashboardPage from "@/pages/DashboardPage"
import LoginPage from "@/pages/LoginPage"
import SignupPage from "@/pages/SignupPage"
import NotFoundPage from "@/pages/NotFoundPage"
import SettingsPage from "@/pages/SettingsPage"
import OnboardPage from "@/pages/OnboardPage"
import AvailableFlatsPage from "@/pages/AvailableFlatsPage"
import NotificationsPage from "@/pages/NotificationsPage"
import PropertiesPage from "@/pages/properties/PropertiesPage"
import PropertyFormPage from "@/pages/properties/PropertyFormPage"
import PropertyDetailPage from "@/pages/properties/PropertyDetailPage"
import FlatDetailPage from "@/pages/flats/FlatDetailPage"
import TenantsPage from "@/pages/tenants/TenantsPage"
import TenantProfilePage from "@/pages/tenants/TenantProfilePage"
import DuePage from "@/pages/DuePage"
import ReportsPage from "@/pages/reports/ReportsPage"
import HistoryPage from "@/pages/HistoryPage"
import ExpensesPage from "@/pages/expenses/ExpensesPage"
import MaintenancePage from "@/pages/maintenance/MaintenancePage"
import AgreementsPage from "@/pages/agreements/AgreementsPage"
import ListingsPage from "@/pages/listings/ListingsPage"
import InterestsPage from "@/pages/InterestsPage"
import VisitsPage from "@/pages/VisitsPage"
import SharedPropertiesPage from "@/pages/SharedPropertiesPage"
import FindFlatPage from "@/pages/portal/FindFlatPage"
import ListingDetailPage from "@/pages/portal/ListingDetailPage"
import SavedFlatsPage from "@/pages/portal/SavedFlatsPage"
import TenantDashboardPage from "@/pages/portal/TenantDashboardPage"
import MyFlatPage from "@/pages/portal/MyFlatPage"
import TenantBillsPage from "@/pages/portal/TenantBillsPage"
import TenantPaymentsPage from "@/pages/portal/TenantPaymentsPage"
import TenantDuePage from "@/pages/portal/TenantDuePage"
import TenantDocumentsPage from "@/pages/portal/TenantDocumentsPage"
import TenantMaintenancePage from "@/pages/portal/TenantMaintenancePage"
import TenantAgreementPage from "@/pages/portal/TenantAgreementPage"
import TenantPortalProfilePage from "@/pages/portal/TenantPortalProfilePage"
import TenantNotificationsPage from "@/pages/portal/TenantNotificationsPage"
import TenantAutopayPage from "@/pages/portal/TenantAutopayPage"
import PaymentsPage from "@/pages/payments/PaymentsPage"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

/** Sends owners to /dashboard and tenants to /home after sign-in. */
function RoleIndex() {
  const { profile, profileLoading } = useAuth()
  if (profileLoading || !profile) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-28" />
      </div>
    )
  }
  return (
    <Navigate to={profile.role === "TENANT" ? "/home" : "/dashboard"} replace />
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              {/* Public self-onboarding (token-gated, no login required) */}
              <Route path="/onboard/:token" element={<OnboardPage />} />
              <Route element={<ProtectedRoute />}>
                <Route index element={<RoleIndex />} />
                <Route element={<RequireRole role="OWNER" fallback="/home" />}>
                  <Route element={<AppShell />}>
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/properties" element={<PropertiesPage />} />
                    <Route path="/properties/new" element={<PropertyFormPage />} />
                    <Route path="/properties/:id" element={<PropertyDetailPage />} />
                    <Route path="/properties/:id/edit" element={<PropertyFormPage />} />
                    <Route path="/flats/:flatId" element={<FlatDetailPage />} />
                    <Route path="/tenants" element={<TenantsPage />} />
                    <Route path="/tenants/:id" element={<TenantProfilePage />} />
                    <Route path="/due" element={<DuePage />} />
                    <Route path="/payments" element={<PaymentsPage />} />
                    <Route path="/reports" element={<ReportsPage />} />
                    <Route path="/history" element={<HistoryPage />} />
                    <Route path="/expenses" element={<ExpensesPage />} />
                    <Route path="/maintenance" element={<MaintenancePage />} />
                    <Route path="/agreements" element={<AgreementsPage />} />
                    <Route path="/listings" element={<ListingsPage />} />
                    <Route path="/interests" element={<InterestsPage />} />
                    <Route path="/visits" element={<VisitsPage />} />
                    <Route path="/shared" element={<SharedPropertiesPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/available-flats" element={<AvailableFlatsPage />} />
                    <Route path="/notifications" element={<NotificationsPage />} />
                  </Route>
                </Route>
                <Route element={<RequireRole role="TENANT" fallback="/dashboard" />}>
                  <Route element={<TenantShell />}>
                    <Route path="/home" element={<TenantDashboardPage />} />
                    <Route path="/home/flat" element={<MyFlatPage />} />
                    <Route path="/home/bills" element={<TenantBillsPage />} />
                    <Route path="/home/payments" element={<TenantPaymentsPage />} />
                    <Route path="/home/autopay" element={<TenantAutopayPage />} />
                    <Route path="/home/due" element={<TenantDuePage />} />
                    <Route path="/home/documents" element={<TenantDocumentsPage />} />
                    <Route path="/home/maintenance" element={<TenantMaintenancePage />} />
                    <Route path="/home/agreement" element={<TenantAgreementPage />} />
                    <Route path="/home/profile" element={<TenantPortalProfilePage />} />
                    <Route path="/home/notifications" element={<TenantNotificationsPage />} />
                    <Route path="/home/find-flat" element={<FindFlatPage />} />
                    <Route path="/home/find-flat/:id" element={<ListingDetailPage />} />
                    <Route path="/home/saved" element={<SavedFlatsPage />} />
                  </Route>
                </Route>
              </Route>
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
