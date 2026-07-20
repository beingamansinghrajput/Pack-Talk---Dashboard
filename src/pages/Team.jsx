import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import Reveal from '../components/Reveal'

const EMPTY_CLIENT = { name: '', email: '', password: '' }

export default function Team() {
  const { isAdmin } = useAuth()
  const [members, setMembers] = useState([])
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [newTeamName, setNewTeamName] = useState('')
  const [message, setMessage] = useState(null)

  const [projects, setProjects] = useState([])
  const [clientProjects, setClientProjects] = useState([])
  const [clientForm, setClientForm] = useState(EMPTY_CLIENT)
  const [clientBusy, setClientBusy] = useState(false)
  const [clientMessage, setClientMessage] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: profileData } = await supabase.from('profiles').select('*').order('created_at')
    const { data: teamData } = await supabase.from('teams').select('*').order('name')
    const { data: projectData } = await supabase.from('projects').select('*').order('project_name')
    const { data: cpData } = await supabase.from('client_projects').select('*')
    setMembers(profileData || [])
    setTeams(teamData || [])
    setProjects(projectData || [])
    setClientProjects(cpData || [])
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

  async function updatePrefix(id, uid_prefix) {
    const cleaned = uid_prefix.trim().toUpperCase()
    await supabase.from('profiles').update({ uid_prefix: cleaned || null }).eq('id', id)
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

  async function createClient(e) {
    e.preventDefault()
    setClientBusy(true)
    setClientMessage(null)
    try {
      const res = await fetch('/api/create-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientForm),
      })
      const data = await res.json()
      if (!res.ok) {
        setClientMessage({ type: 'error', text: data.error || 'Failed to create client' })
      } else {
        setClientMessage({ type: 'success', text: `Client "${clientForm.name}" created.` })
        setClientForm(EMPTY_CLIENT)
        load()
      }
    } catch (err) {
      setClientMessage({ type: 'error', text: err.message })
    }
    setClientBusy(false)
  }

  async function toggleClientProject(client_id, project_id, currentlyLinked) {
    if (currentlyLinked) {
      await supabase.from('client_projects').delete().eq('client_id', client_id).eq('project_id', project_id)
    } else {
      await supabase.from('client_projects').insert({ client_id, project_id })
    }
    load()
  }

  const clients = members.filter((m) => m.role === 'client')

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
        <p className="card-hint">
          UID Prefix: the capital letters at the end of a respondent's UID (before the number) that identify who collected it — e.g. UID "xyzAS01" has prefix "AS".
        </p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th>Team</th><th>UID Prefix</th><th>Joined</th></tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="empty-row">Loading…</td></tr>}
              {!loading && members.filter((m) => m.role !== 'client').map((m) => (
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
                  <td>
                    {isAdmin ? (
                      <input
                        defaultValue={m.uid_prefix || ''}
                        onBlur={(e) => updatePrefix(m.id, e.target.value)}
                        placeholder="e.g. AS"
                        style={{ width: 70, textTransform: 'uppercase' }}
                        maxLength={6}
                      />
                    ) : (
                      m.uid_prefix || '—'
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

      {isAdmin && (
        <Reveal delay={80}>
        <div className="card">
          <h2 className="card-title">Clients</h2>
          <p className="card-hint">
            Create a login for a client so they can add their own survey responses and view stats — only for the projects you assign them to. Clients never see rates or other clients' data.
          </p>

          <form onSubmit={createClient} className="form-grid" style={{ maxWidth: 480, marginTop: 12 }}>
            <label>Client Name
              <input
                required
                value={clientForm.name}
                onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                placeholder="e.g. Toluna"
              />
            </label>
            <label>Email
              <input
                required
                type="email"
                value={clientForm.email}
                onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                placeholder="client@company.com"
              />
            </label>
            <label>Password
              <input
                required
                type="text"
                value={clientForm.password}
                onChange={(e) => setClientForm({ ...clientForm, password: e.target.value })}
                placeholder="Set a login password"
              />
            </label>
            {clientMessage && (
              <div className={clientMessage.type === 'error' ? 'auth-error' : 'auth-success'}>{clientMessage.text}</div>
            )}
            <button className="btn-primary" type="submit" disabled={clientBusy}>
              {clientBusy ? 'Creating…' : 'Create Client'}
            </button>
          </form>

          <div className="table-wrap" style={{ marginTop: 20 }}>
            <table className="data-table">
              <thead>
                <tr><th>Name</th><th>Email</th><th>Projects</th></tr>
              </thead>
              <tbody>
                {clients.length === 0 && <tr><td colSpan={3} className="empty-row">No clients yet.</td></tr>}
                {clients.map((c) => {
                  const linkedProjectIds = clientProjects.filter((cp) => cp.client_id === c.id).map((cp) => cp.project_id)
                  return (
                    <tr key={c.id}>
                      <td>{c.full_name || '—'}</td>
                      <td>{c.email}</td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {projects.length === 0 && <span className="card-hint">No projects yet</span>}
                          {projects.map((p) => {
                            const linked = linkedProjectIds.includes(p.project_id)
                            return (
                              <button
                                key={p.project_id}
                                onClick={() => toggleClientProject(c.id, p.project_id, linked)}
                                className={linked ? 'badge badge-green' : 'badge badge-gray'}
                                style={{ cursor: 'pointer', border: 'none' }}
                                title={linked ? 'Click to remove access' : 'Click to grant access'}
                              >
                                {p.project_id} {linked ? '✓' : '+'}
                              </button>
                            )
                          })}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        </Reveal>
      )}
    </div>
  )
}
