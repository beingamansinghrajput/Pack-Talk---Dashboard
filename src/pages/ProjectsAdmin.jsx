import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import Reveal from '../components/Reveal'

const EMPTY = { project_id: '', project_name: '', target: '', loi: '', ir: '', country: '', launch_date: '' }

export default function ProjectsAdmin() {
  const { user } = useAuth()
  const [projects, setProjects] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false })
    setProjects(data || [])
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
              <tr><th>Project ID</th><th>Name</th><th>Country</th><th>Target</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.project_id}>
                  <td>{p.project_id}</td>
                  <td>{p.project_name}</td>
                  <td>{p.country}</td>
                  <td>{p.target}</td>
                  <td><span className={`badge ${p.status === 'Live' ? 'badge-green' : 'badge-gray'}`}>{p.status}</span></td>
                  <td>
                    <select value={p.status} onChange={(e) => updateStatus(p.project_id, e.target.value)}>
                      <option value="Live">Live</option>
                      <option value="Paused">Paused</option>
                      <option value="Closed">Closed</option>
                    </select>
                  </td>
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
