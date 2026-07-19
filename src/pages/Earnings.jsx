import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import Reveal from '../components/Reveal'

export default function Earnings() {
  const { profile, user, isAdmin, canManageTeam } = useAuth()
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
      .select('project_id, status, created_by')
      .eq('status', 'Completed')

    setMembers(memberData || [])
    setTeams(teamData || [])
    setProjects(projectData || [])
    setRates(rateData || [])
    setResponses(respData || [])
    setLoading(false)
  }

  const projectName = (id) => projects.find((p) => p.project_id === id)?.project_name || id

  // Build earnings breakdown: for each person, for each project, their completed count + rate + total
  const earningsByPerson = useMemo(() => {
    const targetMembers = canManageTeam
      ? members.filter((m) => m.role !== 'admin' && (!teamFilter || m.team_id === teamFilter))
      : members.filter((m) => m.id === user?.id)

    return targetMembers.map((m) => {
      const myCompleted = responses.filter((r) => r.created_by === m.id)
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
  }, [members, responses, rates, teamFilter, canManageTeam, user])

  if (loading) return <div className="page-loading">Loading earnings…</div>

  return (
    <div className="page">
      <h1>Earnings</h1>
      <p className="page-sub">
        {canManageTeam
          ? 'Completed respondents × pay rate, per person, per project.'
          : 'Your completed respondents and earnings across all projects.'}
      </p>

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

      {earningsByPerson.length === 0 && (
        <Reveal>
          <div className="card">
            <p className="empty-row">No earnings data yet — either no one has been assigned rates, or no Completed respondents have been logged.</p>
          </div>
        </Reveal>
      )}

      {earningsByPerson.map(({ member, rows, grandTotal }, idx) => (
        <Reveal key={member.id} delay={idx * 60}>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h2 className="card-title">{member.full_name || member.email}</h2>
              <span className="badge badge-green" style={{ fontSize: 16 }}>
                ₹{grandTotal.toLocaleString('en-IN')}
              </span>
            </div>
            {rows.length === 0 ? (
              <p className="card-hint">No completed respondents logged yet.</p>
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
