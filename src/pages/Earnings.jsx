import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import Reveal from '../components/Reveal'

function extractPrefix(uid) {
  if (!uid) return null
  const match = uid.match(/([A-Z]+\d+)$/)
  return match ? match[1] : null
}

export default function Earnings() {
  const { profile, isAdmin, canManageTeam } = useAuth()
  const [members, setMembers] = useState([])
  const [teams, setTeams] = useState([])
  const [projects, setProjects] = useState([])
  const [responses, setResponses] = useState([])
  const [rates, setRates] = useState([])
  const [loading, setLoading] = useState(true)
  const [teamFilter, setTeamFilter] = useState('')

  useEffect(() => {
    if (profile) load()
  }, [profile])

  async function load() {
    setLoading(true)
    const [{ data: memberData }, { data: teamData }, { data: projectData }, { data: rateData }] = await Promise.all([
      supabase.from('profiles').select('*'),
      supabase.from('teams').select('*').order('name'),
      supabase.from('projects').select('*'),
      supabase.from('rates').select('*'),
    ])

    const { data: respData } = await supabase
      .from('responses')
      .select('project_id, status, uid')
      .eq('status', 'Completed')

    setMembers(memberData || [])
    setTeams(teamData || [])
    setProjects(projectData || [])
    setRates(rateData || [])
    setResponses(respData || [])
    setLoading(false)
  }

  const projectName = (id) => projects.find((p) => p.project_id === id)?.project_name || id

  const earningsByPerson = useMemo(() => {
    const targetMembers = canManageTeam
      ? members.filter((m) => m.role !== 'admin' && m.uid_prefix && (!teamFilter || m.team_id === teamFilter))
      : members.filter((m) => m.id === profile?.id && m.uid_prefix)

    return targetMembers.map((m) => {
      const myCompleted = responses.filter((r) => extractPrefix(r.uid) === m.uid_prefix)
      const byProject = {}
      myCompleted.forEach((r) => {
        byProject[r.project_id] = (byProject[r.project_id] || 0) + 1
      })

      const rows = Object.entries(byProject).map(([project_id, count]) => {
        const rate = rates.find((rt) => rt.user_id === m.id && rt.project_id === project_id)?.amount || 0
        return { project_id, count, rate, total: count * rate }
      })

      const grandTotal = rows.reduce((sum, r) => sum + r.total, 0)

      return { member: m, rows, grandTotal }
    })
  }, [members, responses, rates, teamFilter, canManageTeam, profile])

  const noPrefixMembers = useMemo(() => {
    if (!canManageTeam) return []
    return members.filter((m) => m.role !== 'admin' && !m.uid_prefix)
  }, [members, canManageTeam])

  const teammateStats = useMemo(() => {
    if (canManageTeam) return []
    if (!profile?.team_id) return []
    return members
      .filter((m) => m.team_id === profile.team_id && m.id !== profile.id && m.role !== 'admin' && m.uid_prefix)
      .map((m) => {
        const completedCount = responses.filter((r) => extractPrefix(r.uid) === m.uid_prefix).length
        return { member: m, completedCount }
      })
  }, [members, responses, canManageTeam, profile])

  const myTeamName = useMemo(() => {
    if (!profile?.team_id) return null
    return teams.find((t) => t.id === profile.team_id)?.name || null
  }, [teams, profile])

  if (loading) return <div className="page-loading">Loading earnings…</div>

  return (
    <div className="page">
      <h1>Earnings</h1>
      <p className="page-sub">
        {canManageTeam
          ? 'Completed respondents (matched by UID code) × pay rate, per person, per project.'
          : 'Your completed respondents and earnings, plus completion counts for your team.'}
      </p>

      {!isAdmin && !canManageTeam && !profile?.uid_prefix && (
        <div className="auth-error" style={{ marginBottom: 16 }}>
          You don't have a UID code assigned yet — ask your admin to set one on the Team page so your earnings can be tracked.
        </div>
      )}

      {canManageTeam && (
        <Reveal>
          <div className="card" style={{ maxWidth: 320 }}>
            <label>Filter by Team
              <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
                <option value="">All Teams</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          </div>
        </Reveal>
      )}

      {canManageTeam && noPrefixMembers.length > 0 && (
        <Reveal>
          <div className="auth-error" style={{ marginBottom: 16 }}>
            {noPrefixMembers.length} member(s) don't have a UID code set yet, so their earnings can't be calculated: {noPrefixMembers.map((m) => m.full_name || m.email).join(', ')}. Set it on the Team page.
          </div>
        </Reveal>
      )}

      {earningsByPerson.length === 0 && (
        <Reveal>
          <div className="card">
            <p className="empty-row">No earnings data yet — either no one has a UID code set, no rates assigned, or no Completed respondents match yet.</p>
          </div>
        </Reveal>
      )}

      {earningsByPerson.map(({ member, rows, grandTotal }, idx) => (
        <Reveal key={member.id} delay={idx * 60}>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h2 className="card-title">{member.full_name || member.email} <span className="card-hint">({member.uid_prefix})</span></h2>
              <span className="badge badge-green" style={{ fontSize: 16 }}>
                ₹{grandTotal.toLocaleString('en-IN')}
              </span>
            </div>
            {rows.length === 0 ? (
              <p className="card-hint">No completed respondents matched yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table small">
                  <thead>
                    <tr><th>Project</th><th>Completed</th><th>Rate (₹)</th><th>Subtotal (₹)</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.project_id}>
                        <td>{r.project_id} — {projectName(r.project_id)}</td>
                        <td>{r.count}</td>
                        <td>{r.rate}</td>
                        <td>{r.total.toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Reveal>
      ))}

      {!canManageTeam && profile?.team_id && (
        <Reveal delay={80}>
          <div className="card">
            <h2 className="card-title">Team Activity{myTeamName ? ` — ${myTeamName}` : ''}</h2>
            <p className="card-hint">
              Completed respondent counts for your teammates. Pay amounts are private to each person.
            </p>
            {teammateStats.length === 0 ? (
              <p className="card-hint" style={{ marginTop: 8 }}>No other teammates with a UID code yet.</p>
            ) : (
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table className="data-table small">
                  <thead>
                    <tr><th>Name</th><th>Completed</th></tr>
                  </thead>
                  <tbody>
                    {teammateStats.map(({ member, completedCount }) => (
                      <tr key={member.id}>
                        <td>{member.full_name || member.email} <span className="card-hint">({member.uid_prefix})</span></td>
                        <td>{completedCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Reveal>
      )}

      {!canManageTeam && !profile?.team_id && (
        <Reveal delay={80}>
          <div className="auth-error">
            You're not assigned to a team yet, so team activity can't be shown. Ask your admin to add you to a team.
          </div>
        </Reveal>
      )}
    </div>
  )
}
