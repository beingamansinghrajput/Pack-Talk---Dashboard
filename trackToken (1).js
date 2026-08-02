import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import Reveal from '../components/Reveal'

const EMPTY_CLIENT = { name: '', email: '', password: '' }
const EMPTY_EMPLOYEE = { name: '', email: '', password: '', role: 'tl', team_id: '', uid_prefix: '' }

export default function Team() {
  const { isAdmin, isTeamLead, profile, session } = useAuth()
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

  const [employeeForm, setEmployeeForm] = useState(EMPTY_EMPLOYEE)
  const [employeeBusy, setEmployeeBusy] = useState(false)
  const [employeeMessage, setEmployeeMessage] = useState(null)

  const [stings, setStings] = useState([])
  const [newStingText, setNewStingText] = useState({})
  const [stingError, setStingError] = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: profileData } = await supabase.from('profiles').select('*').order('created_at')
    const { data: teamData } = await supabase.from('teams').select('*').order('name')
    const { data: projectData } = await supabase.from('projects').select('*').order('project_name')
    const { data: cpData } = await supabase.from('client_projects').select('*')
    const { data: stingData } = await supabase.from('sting_prefixes').select('*').order('prefix')
    setMembers(profileData || [])
    setTeams(teamData || [])
    setProjects(projectData || [])
    setClientProjects(cpData || [])
    setStings(stingData || [])
    setLoading(false)
  }

  // Can the current user edit this particular member row (name / stings only)?
  function canEditMember(m) {
    if (isAdmin) return true
    if (isTeamLead) return m.role === 'tl' && m.team_id === profile?.team_id
    return false
  }

  function stingsFor(profileId) {
    return stings.filter((s) => s.profile_id === profileId)
  }

  async function addSting(profileId) {
    const cleaned = (newStingText[profileId] || '').trim().toUpperCase()
    setStingError({ ...stingError, [profileId]: null })
    if (!cleaned) return
    const { error } = await supabase.from('sting_prefixes').insert({ profile_id: profileId, prefix: cleaned })
    if (error) {
      setStingError({ ...stingError, [profileId]: error.code === '23505' ? `"${cleaned}" is already assigned to someone else.` : error.message })
      return
    }
    setNewStingText({ ...newStingText, [profileId]: '' })
    load()
  }

  async function removeSting(id) {
    await supabase.from('sting_prefixes').delete().eq('id', id)
    load()
  }

  async function changeRole(id, role) {
    await supabase.from('profiles').update({ role }).eq('id', id)
    load()
  }

  async function changeTeam(id, team_id) {
    await supabase.from('profiles').update({ team_id: team_id || null }).eq('id', id)
    load()
  }

  async function updateName(id, full_name) {
    const cleaned = full_name.trim()
    if (!cleaned) return
    await supabase.from('profiles').update({ full_name: cleaned }).eq('id', id)
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

  async function createEmployee(e) {
    e.preventDefault()
    setEmployeeBusy(true)
    setEmployeeMessage(null)
    try {
      const res = await fetch('/api/create-employee', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(employeeForm),
      })
      const data = await res.json()
      if (!res.ok) {
        setEmployeeMessage({ type: 'error', text: data.error || 'Failed to create employee' })
      } else if (data.warning) {
        setEmployeeMessage({ type: 'error', text: data.warning })
        setEmployeeForm(EMPTY_EMPLOYEE)
        load()
      } else {
        setEmployeeMessage({ type: 'success', text: `${employeeForm.name} added.` })
        setEmployeeForm(EMPTY_EMPLOYEE)
        load()
      }
    } catch (err) {
      setEmployeeMessage({ type: 'error', text: err.message })
    }
    setEmployeeBusy(false)
  }

  async function createClient(e) {
    e.preventDefault()
    setClientBusy(true)
    setClientMessage(null)
    try {
      const res = await fetch('/api/create-client', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
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
  const myTeamName = useMemo(() => teams.find((t) => t.id === profile?.team_id)?.name, [teams, profile])

  return (
    <div className="page">
      <h1>Team</h1>
      <p className="page-sub">
        Everyone who has logged in at least once appears here automatically. Use the form below to add a new
        team member directly — no more creating logins by hand in Supabase.
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

      {(isAdmin || isTeamLead) && (
        <Reveal delay={40}>
        <div className="card">
          <h2 className="card-title">Add Employee</h2>
          <p className="card-hint">
            {isAdmin
              ? 'Creates a login instantly — pick their role and team below.'
              : `Creates a Survey Analyst login on your team${myTeamName ? ` (${myTeamName})` : ''}.`}
          </p>
          <form onSubmit={createEmployee} className="form-grid" style={{ maxWidth: 480, marginTop: 12 }}>
            <label>Name
              <input
                required
                value={employeeForm.name}
                onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })}
                placeholder="e.g. Rahul Sharma"
              />
            </label>
            <label>Email
              <input
                required
                type="email"
                value={employeeForm.email}
                onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })}
                placeholder="employee@company.com"
              />
            </label>
            <label>Password
              <input
                required
                type="text"
                value={employeeForm.password}
                onChange={(e) => setEmployeeForm({ ...employeeForm, password: e.target.value })}
                placeholder="Set a login password"
              />
            </label>
            {isAdmin && (
              <label>Role
                <select
                  value={employeeForm.role}
                  onChange={(e) => setEmployeeForm({ ...employeeForm, role: e.target.value })}
                >
                  <option value="tl">Survey Analyst</option>
                  <option value="team_lead">Team Lead</option>
                </select>
              </label>
            )}
            {isAdmin && (
              <label>Team
                <select
                  value={employeeForm.team_id}
                  onChange={(e) => setEmployeeForm({ ...employeeForm, team_id: e.target.value })}
                >
                  <option value="">No team</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
            )}
            <label>First Sting Code (optional)
              <input
                value={employeeForm.uid_prefix}
                onChange={(e) => setEmployeeForm({ ...employeeForm, uid_prefix: e.target.value })}
                placeholder="e.g. AS02"
                maxLength={10}
                style={{ textTransform: 'uppercase' }}
              />
              <span className="card-hint">You can add more stings for this person later on this page.</span>
            </label>
            {employeeMessage && (
              <div className={employeeMessage.type === 'error' ? 'auth-error' : 'auth-success'}>{employeeMessage.text}</div>
            )}
            <button className="btn-primary" type="submit" disabled={employeeBusy}>
              {employeeBusy ? 'Adding…' : 'Add Employee'}
            </button>
          </form>
        </div>
        </Reveal>
      )}

      <Reveal delay={60}>
      <div className="card">
        <h2 className="card-title">Members</h2>
        <p className="card-hint">
          Stings: the code at the end of a respondent's UID that identifies who collected it — e.g. UID "xyzAS02" carries the sting "AS02". Someone can hold multiple stings (one per client/vendor) — each sting code must be unique across everyone.
        </p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th>Team</th><th>Stings</th><th>Joined</th></tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="empty-row">Loading…</td></tr>}
              {!loading && members.filter((m) => m.role !== 'client').map((m) => {
                const editable = canEditMember(m)
                const memberStings = stingsFor(m.id)
                return (
                <tr key={m.id}>
                  <td>
                    {editable ? (
                      <input
                        defaultValue={m.full_name || ''}
                        onBlur={(e) => e.target.value.trim() !== (m.full_name || '') && updateName(m.id, e.target.value)}
                        placeholder="Full name"
                        style={{ width: 140 }}
                      />
                    ) : (
                      m.full_name || '—'
                    )}
                  </td>
                  <td>{m.email}</td>
                  <td>
                    {isAdmin ? (
                      <select value={m.role} onChange={(e) => changeRole(m.id, e.target.value)}>
                        <option value="tl">Survey Analyst</option>
                        <option value="team_lead">Team Lead</option>
                        <option value="admin">Admin</option>
                      </select>
                    ) : (
                      <span className="badge badge-gray">{m.role === 'tl' ? 'Survey Analyst' : m.role === 'team_lead' ? 'Team Lead' : m.role}</span>
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
                  <td style={{ minWidth: 180 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: editable ? 6 : 0 }}>
                      {memberStings.length === 0 && <span className="card-hint">None yet</span>}
                      {memberStings.map((s) => (
                        <span key={s.id} className="badge badge-gray" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {s.prefix}
                          {editable && (
                            <button
                              onClick={() => removeSting(s.id)}
                              title="Remove this sting"
                              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 12 }}
                            >✕</button>
                          )}
                        </span>
                      ))}
                    </div>
                    {editable && (
                      <div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <input
                            value={newStingText[m.id] || ''}
                            onChange={(e) => setNewStingText({ ...newStingText, [m.id]: e.target.value })}
                            placeholder="e.g. AV02"
                            style={{ width: 80, textTransform: 'uppercase' }}
                            maxLength={10}
                          />
                          <button className="btn-ghost" onClick={() => addSting(m.id)} style={{ padding: '2px 10px' }}>+ Add</button>
                        </div>
                        {stingError[m.id] && <div className="auth-error" style={{ fontSize: 12, marginTop: 4 }}>{stingError[m.id]}</div>}
                      </div>
                    )}
                  </td>
                  <td>{new Date(m.created_at).toLocaleDateString()}</td>
                </tr>
              )})}
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
