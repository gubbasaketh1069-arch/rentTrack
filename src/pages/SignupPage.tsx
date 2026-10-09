import { useState } from "react"
import type { FormEvent } from "react"
import { Link, Navigate, useNavigate } from "react-router-dom"
import { Building2, KeyRound } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

type AccountType = "OWNER" | "TENANT"

/**
 * Real Supabase email/password sign-up. The account type is stored in the
 * auth user's metadata; the `on_auth_user_created` trigger turns it into a
 * profiles row. Errors come from the backend — nothing is faked.
 */
export default function SignupPage() {
  const navigate = useNavigate()
  const { user, authReady } = useAuth()
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [accountType, setAccountType] = useState<AccountType>("OWNER")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (authReady && user) {
    return <Navigate to="/dashboard" replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName.trim() || null, role: accountType },
        },
      })
      if (signUpError) {
        setError(signUpError.message)
        return
      }
      // With email confirmation disabled the session starts immediately;
      // with it enabled the user must confirm first — either way the login
      // page is the honest next step.
      navigate("/login", { replace: true })
    } finally {
      setLoading(false)
    }
  }

  const roleCard = (
    type: AccountType,
    title: string,
    description: string,
    Icon: typeof Building2
  ) => (
    <button
      key={type}
      type="button"
      onClick={() => setAccountType(type)}
      aria-pressed={accountType === type}
      className={cn(
        "flex flex-1 items-start gap-3 rounded-lg border p-3 text-left transition-colors",
        accountType === type
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-input hover:bg-accent"
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 h-5 w-5 shrink-0",
          accountType === type ? "text-primary" : "text-muted-foreground"
        )}
      />
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
    </button>
  )

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-0 shadow-none">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-xl font-extrabold text-primary-foreground">
            R
          </div>
          <CardTitle className="text-2xl font-extrabold tracking-tight">Create your RentTrack account</CardTitle>
          <CardDescription>
            Track Every Property. Manage Every Rent.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>I am a</Label>
              <div className="flex gap-2">
                {roleCard(
                  "OWNER",
                  "Property Owner",
                  "Manage properties, tenants, rent and bills.",
                  Building2
                )}
                {roleCard(
                  "TENANT",
                  "Tenant",
                  "View your flat, rent, bills and payments.",
                  KeyRound
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                type="text"
                placeholder="Saketh Gubba"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Minimum 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating account…" : "Create account"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link to="/login" className="font-medium text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
