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

  if (loading) return <div className="page-loading">Loading earnings…</div>

  return (
    <div className="page">
      <h1>Earnings</h1>
      <p className="page-sub">
        {canManageTeam
          ? 'Completed respondents (matched by UID code) × pay rate, per person, per project.'
          : 'Your completed respondents and earnings across all projects.'}
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
    </div>
  )
}
