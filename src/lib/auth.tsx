import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import type { Session, User } from "@supabase/supabase-js"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"

export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  phone: string | null
  role: "OWNER" | "TENANT"
  created_at: string
  updated_at: string
}

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  profileLoading: boolean
  profileError: string | null
  signOut: () => Promise<void>
  authReady: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Fetches the user's profiles row. The row is normally created by the
 * `on_auth_user_created` trigger at signup; as a fallback (e.g. the trigger
 * migration was applied after the user signed up) the client inserts its own
 * row — RLS policy "Users insert own profile" allows exactly that.
 */
async function fetchProfile(user: User): Promise<Profile> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (data) return data as Profile
    // Trigger may still be committing; wait briefly before retrying.
    await new Promise((r) => setTimeout(r, 600))
  }
  const metaRole =
    (user.user_metadata as Record<string, unknown> | null)?.role === "TENANT"
      ? "TENANT"
      : "OWNER"
  const { data, error } = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      email: user.email,
      full_name:
        ((user.user_metadata as Record<string, unknown> | null)?.full_name as
          | string
          | undefined) ?? null,
      role: metaRole,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as Profile
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const queryClient = useQueryClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession)
        if (!nextSession) queryClient.removeQueries({ queryKey: ["profile"] })
      }
    )
    return () => listener.subscription.unsubscribe()
  }, [queryClient])

  const user = session?.user ?? null

  const profileQuery = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: () => fetchProfile(user!),
    enabled: !!user,
    retry: 1,
    staleTime: 60_000,
  })

  async function signOut() {
    await supabase.auth.signOut()
    queryClient.clear()
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      profile: (profileQuery.data as Profile | undefined) ?? null,
      profileLoading: !!user && profileQuery.isLoading,
      profileError: profileQuery.error
        ? (profileQuery.error as Error).message
        : null,
      signOut,
      authReady,
    }),
    [session, user, profileQuery.data, profileQuery.isLoading, profileQuery.error, authReady]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider")
  return ctx
}
