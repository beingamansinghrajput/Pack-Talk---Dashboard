import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const ROLE_LABELS = {
  admin: 'Admin',
  team_lead: 'Team Lead',
  tl: 'Survey Analyst',
  client: 'Client',
}

const AuthContext = createContext()
export function useAuth() {
  return useContext(AuthContext)
}
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) {
        loadProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        loadProfile(session.user.id)
      } else {
        setProfile(null)
        setLoading(false)
      }
    })
    return () => listener.subscription.unsubscribe()
  }, [])
  async function loadProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
    setLoading(false)
  }
  async function refreshProfile() {
    if (session) {
      await loadProfile(session.user.id)
    }
  }
  async function signOut() {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
  }
  const isAdmin = profile?.role === 'admin'
  const isTeamLead = profile?.role === 'team_lead'
  const isClient = profile?.role === 'client'
  const canManageTeam = isAdmin || isTeamLead
  const canAccessOpsPages = isAdmin || isTeamLead
  const roleLabel = ROLE_LABELS[profile?.role] || profile?.role
  const value = {
    session,
    user: session?.user ?? null,
    profile,
    isAdmin,
    isTeamLead,
    isClient,
    canManageTeam,
    canAccessOpsPages,
    roleLabel,
    loading,
    signOut,
    refreshProfile,
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
