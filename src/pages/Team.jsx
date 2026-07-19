import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import Reveal from '../components/Reveal'

export default function Team() {
  const { isAdmin } = useAuth()
  const [members, setMembers] = useState([])
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [newTeamName, setNewTeamName] = useState('')
  const [message, setMessage] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: profileData } = await supabase.from('profiles').select('*').order('created_at')
    const { data: teamData } = await supabase.from('teams').select('*').order('name')
    setMembers(profileData || [])
    setTeams(teamData || [])
    setLoading(false)
  }

  async function changeRole(id, role) {
    await supabase.from('profiles').update({ role }).eq('id', id)
    load()
  }

  async function changeTeam(id, team_id) {
    await supabase.from('profiles').update({ team_id: team_id || null }).eq('id', id)
    load()
  }

  async function createTeam(e) {
    e.preventDefault()
    if (!newTeamName.trim()) return
    const { error } = await supabase.from('teams').insert({ name: newTeamName.trim() })
    if (error) {
      setMessage({ type: 'error', text: error.message })
    } else {
      setMessage({ type: 'success', text: `Team "${newTeamName}" created.` })
      setNewTeamName('')
      load()
    }
  }

  return (
    <div className="page">
      <h1>Team</h1>
      <p className="page-sub">
        Everyone who has logged in at least once appears here automatically. To add a new TL,
        create their login in Supabase → Authentication → Users → Add User; they'll show up
        here the first time they sign in.
      </p>

      {isAdmin && (
        <Reveal>
        <div className="card">
          <h2 className="card-title">Teams</h2>
          <form onSubmit={createTeam} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="New team name, e.g. Team Alpha"
              style={{ flex: 1 }}
            />
            <button className="btn-primary" type="submit">Create Team</button>
          </form>
          {message && <div className={message.type === 'error' ? 'auth-error' : 'auth-success'}>{message.text}</div>}
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="data-table small">
              <thead><tr><th>Team Name</th></tr></thead>
              <tbody>
                {teams.length === 0 && <tr><td className="empty-row">No teams created yet.</td></tr>}
                {teams.map((t) => <tr key={t.id}><td>{t.name}</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
        </Reveal>
      )}

      <Reveal>
      <div className="card">
        <h2 className="card-title">Members</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th>Team</th><th>Joined</th></tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="empty-row">Loading…</td></tr>}
              {!loading && members.map((m) => (
                <tr key={m.id}>
                  <td>{m.full_name || '—'}</td>
                  <td>{m.email}</td>
                  <td>
                    {isAdmin ? (
                      <select value={m.role} onChange={(e) => changeRole(m.id, e.target.value)}>
                        <option value="tl">TL</option>
                        <option value="team_lead">Team Lead</option>
                        <option value="admin">Admin</option>
                      </select>
                    ) : (
                      <span className="badge badge-gray">{m.role}</span>
                    )}
                  </td>
                  <td>
                    {isAdmin ? (
                      <select value={m.team_id || ''} onChange={(e) => changeTeam(m.id, e.target.value)}>
                        <option value="">No team</option>
                        {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    ) : (
                      teams.find((t) => t.id === m.team_id)?.name || '—'
                    )}
                  </td>
                  <td>{new Date(m.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </Reveal>
    </div>
  )
}
