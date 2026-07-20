import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import Reveal from '../components/Reveal'

const EMPTY = { project_id: '', project_name: '', target: '', loi: '', ir: '', country: '', launch_date: '' }
const TRACK_BASE = 'https://pack-talk-dashboard.vercel.app/api/track'

export default function ProjectsAdmin() {
  const { user } = useAuth()
  const [projects, setProjects] = useState([])
  const [teams, setTeams] = useState([])
  const [teamProjects, setTeamProjects] = useState([])
  const [members, setMembers] = useState([])
  const [rates, setRates] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [ratesProjectId, setRatesProjectId] = useState(null)
  const [linksProjectId, setLinksProjectId] = useState(null)
  const [copiedKey, setCopiedKey] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: projectData }, { data: teamData }, { data: tpData }, { data: memberData }, { data: rateData }] = await Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('teams').select('*').order('name'),
      supabase.from('team_projects').select('*'),
      supabase.from('profiles').select('*'),
      supabase.from('rates').select('*'),
    ])
    setProjects(projectData || [])
    setTeams(teamData || [])
    setTeamProjects(tpData || [])
    setMembers(memberData || [])
    setRates(rateData || [])
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    const { error } = await supabase.from('projects').insert({
      ...form,
      target: Number(form.target) || 0,
      loi: Number(form.loi) || 0,
      ir: Number(form.ir) || 0,
      launch_date: form.launch_date || new Date().toISOString().slice(0, 10),
      created_by: user.id,
    })
    setBusy(false)
    if (error) {
      setMessage({ type: 'error', text: error.message })
    } else {
      setMessage({ type: 'success', text: `Project ${form.project_id} created.` })
      setForm(EMPTY)
      load()
    }
  }

  async function updateStatus(project_id, status) {
    await supabase.from('projects').update({ status }).eq('project_id', project_id)
    load()
  }

  async function toggleTeamAccess(project_id, team_id, currentlyLinked) {
    if (currentlyLinked) {
      await supabase.from('team_projects').delete().eq('project_id', project_id).eq('team_id', team_id)
    } else {
      await supabase.from('team_projects').insert({ project_id, team_id })
    }
    load()
  }

  function getRate(userId, project_id) {
    return rates.find((r) => r.user_id === userId && r.project_id === project_id)?.amount ?? ''
  }

  async function updateRate(userId, project_id, amount) {
    const numAmount = Number(amount) || 0
    await supabase.from('rates').upsert(
      { user_id: userId, project_id, amount: numAmount, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,project_id' }
    )
    load()
  }

  function getTrackingLinks(project_id) {
    return [
      { label: 'Complete', status: 'complete', url: `${TRACK_BASE}?project=${project_id}&uid=[UID]&status=complete` },
      { label: 'Terminate', status: 'terminate', url: `${TRACK_BASE}?project=${project_id}&uid=[UID]&status=terminate` },
      { label: 'Quota Full', status: 'quotafull', url: `${TRACK_BASE}?project=${project_id}&uid=[UID]&status=quotafull` },
      { label: 'Security', status: 'security', url: `${TRACK_BASE}?project=${project_id}&uid=[UID]&status=security` },
    ]
  }

  function copyLink(key, url) {
    navigator.clipboard.writeText(url)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 1500)
  }

  return (
    <div className="page">
      <h1>Manage Projects</h1>
      <p className="page-sub">Add a new survey project so your team can start punching in responses.</p>

      <Reveal>
      <div className="card" style={{ maxWidth: 640 }}>
        <h2 className="card-title">New Project</h2>
        <form onSubmit={handleSubmit} className="form-grid">
          <label>Project ID
            <input required value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })} placeholder="e.g. COIN658" />
          </label>
          <label>Project Name
            <input required value={form.project_name} onChange={(e) => setForm({ ...form, project_name: e.target.value })} placeholder="e.g. Consumer Panel Wave 3" />
          </label>
          <label>Country
            <input required value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          </label>
          <label>Target
            <input type="number" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} />
          </label>
          <label>LOI (min)
            <input type="number" value={form.loi} onChange={(e) => setForm({ ...form, loi: e.target.value })} />
          </label>
          <label>IR (%)
            <input type="number" value={form.ir} onChange={(e) => setForm({ ...form, ir: e.target.value })} />
          </label>
          <label>Launch Date
            <input type="date" value={form.launch_date} onChange={(e) => setForm({ ...form, launch_date: e.target.value })} />
          </label>
          {message && <div className={message.type === 'error' ? 'auth-error' : 'auth-success'}>{message.text}</div>}
          <button className="btn-primary" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create Project'}</button>
        </form>
      </div>
      </Reveal>

      <Reveal delay={80}>
      <div className="card">
        <h2 className="card-title">All Projects</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Project ID</th><th>Name</th><th>Country</th><th>Target</th><th>Status</th><th>Teams with Access</th><th></th></tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const linkedTeamIds = teamProjects.filter((tp) => tp.project_id === p.project_id).map((tp) => tp.team_id)
                return (
                  <tr key={p.project_id}>
                    <td>{p.project_id}</td>
                    <td>{p.project_name}</td>
                    <td>{p.country}</td>
                    <td>{p.target}</td>
                    <td><span className={`badge ${p.status === 'Live' ? 'badge-green' : 'badge-gray'}`}>{p.status}</span></td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {teams.length === 0 && <span className="card-hint">No teams yet</span>}
                        {teams.map((t) => {
                          const linked = linkedTeamIds.includes(t.id)
                          return (
                            <button
                              key={t.id}
                              onClick={() => toggleTeamAccess(p.project_id, t.id, linked)}
                              className={linked ? 'badge badge-green' : 'badge badge-gray'}
                              style={{ cursor: 'pointer', border: 'none' }}
                              title={linked ? 'Click to remove access' : 'Click to grant access'}
                            >
                              {t.name} {linked ? '✓' : '+'}
                            </button>
                          )
                        })}
                      </div>
                    </td>
                    <td style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <select value={p.status} onChange={(e) => updateStatus(p.project_id, e.target.value)}>
                        <option value="Live">Live</option>
                        <option value="Paused">Paused</option>
                        <option value="Closed">Closed</option>
                      </select>
                      <button
                        className="btn-ghost"
                        onClick={() => setRatesProjectId(ratesProjectId === p.project_id ? null : p.project_id)}
                      >
                        {ratesProjectId === p.project_id ? 'Hide Rates' : 'Manage Rates'}
                      </button>
                      <button
                        className="btn-ghost"
                        onClick={() => setLinksProjectId(linksProjectId === p.project_id ? null : p.project_id)}
                      >
                        {linksProjectId === p.project_id ? 'Hide Links' : 'Tracking Links'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {ratesProjectId && (
          <div className="card" style={{ marginTop: 16, background: 'rgba(255,255,255,0.02)' }}>
            <h2 className="card-title">Pay Rates — {ratesProjectId}</h2>
            <p className="card-hint">Set how much each person earns per Completed respondent on this project.</p>
            <div className="table-wrap">
              <table className="data-table small">
                <thead>
                  <tr><th>Name</th><th>Email</th><th>Rate per Completed (₹)</th></tr>
                </thead>
                <tbody>
                  {members.filter((m) => m.role !== 'admin').map((m) => (
                    <tr key={m.id}>
                      <td>{m.full_name || '—'}</td>
                      <td>{m.email}</td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          defaultValue={getRate(m.id, ratesProjectId)}
                          onBlur={(e) => updateRate(m.id, ratesProjectId, e.target.value)}
                          style={{ width: 100 }}
                          placeholder="0"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {linksProjectId && (
          <div className="card" style={{ marginTop: 16, background: 'rgba(255,255,255,0.02)' }}>
            <h2 className="card-title">Tracking Links — {linksProjectId}</h2>
            <p className="card-hint">
              Replace <code>[UID]</code> in each link with your survey tool's dynamic respondent-ID variable before handing it to a client or embedding it as a redirect URL.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
              {getTrackingLinks(linksProjectId).map((link) => (
                <div key={link.status} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span className="badge badge-gray" style={{ minWidth: 90, textAlign: 'center' }}>{link.label}</span>
                  <input
                    readOnly
                    value={link.url}
                    onFocus={(e) => e.target.select()}
                    style={{ flex: 1, minWidth: 260, fontFamily: 'monospace', fontSize: 12 }}
                  />
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => copyLink(link.status, link.url)}
                  >
                    {copiedKey === link.status ? 'Copied ✓' : 'Copy'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      </Reveal>
    </div>
  )
}
