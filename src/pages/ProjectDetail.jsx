import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import Reveal from '../components/Reveal'

const STATUS_CLASS = {
  Completed: 'badge-green',
  Terminated: 'badge-red',
  QuotaFull: 'badge-amber',
  Disqualify: 'badge-gray',
}
const PAGE_SIZE = 15

export default function ProjectDetail() {
  const { projectId } = useParams()
  const { isAdmin } = useAuth()
  const [project, setProject] = useState(null)
  const [rows, setRows] = useState([])
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [actionMessage, setActionMessage] = useState(null)

  useEffect(() => {
    load()
  }, [projectId, page])

  async function load() {
    setLoading(true)
    const { data: proj } = await supabase.from('projects').select('*').eq('project_id', projectId).single()
    setProject(proj)
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const { data, count } = await supabase
      .from('responses')
      .select('*', { count: 'exact' })
      .eq('project_id', projectId)
      .eq('deleted', false)
      .order('start_time', { ascending: false })
      .range(from, to)
    setRows(data || [])
    setTotal(count || 0)
    setLoading(false)
  }

  async function handleDelete(row) {
    const confirmed = window.confirm(`Remove respondent ${row.uid}? This can be restored later by an admin if needed.`)
    if (!confirmed) return

    const { error } = await supabase
      .from('responses')
      .update({ deleted: true })
      .eq('id', row.id)

    if (error) {
      setActionMessage({ type: 'error', text: error.message })
    } else {
      setActionMessage({ type: 'success', text: `Respondent ${row.uid} removed.` })
      load()
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="page">
      <div className="breadcrumb">
        <Link to="/">Dashboard</Link> <span>›</span> <span>Project {projectId}</span>
      </div>
      <h1>Project Details: {projectId}</h1>
      {project && <p className="page-sub">{project.project_name} · {project.country} · Target {project.target}</p>}

      {actionMessage && (
        <div className={actionMessage.type === 'error' ? 'auth-error' : 'auth-success'} style={{ marginBottom: 12 }}>
          {actionMessage.text}
        </div>
      )}

      <Reveal>
      <div className="card">
        <h2 className="card-title">Member Survey Overview</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>UID</th>
                <th>Start Time</th>
                <th>End Time</th>
                <th>Duration</th>
                <th>Country</th>
                <th>Status</th>
                {isAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={isAdmin ? 8 : 7} className="empty-row">Loading…</td></tr>}
              {!loading && rows.map((r, i) => (
                <tr key={r.id}>
                  <td>{page * PAGE_SIZE + i + 1}</td>
                  <td>{r.uid}</td>
                  <td>{new Date(r.start_time).toLocaleString()}</td>
                  <td>{r.end_time ? new Date(r.end_time).toLocaleString() : '—'}</td>
                  <td>{r.duration_min != null ? `${r.duration_min} min` : '—'}</td>
                  <td>{r.country}</td>
                  <td><span className={`badge ${STATUS_CLASS[r.status]}`}>{r.status}</span></td>
                  {isAdmin && (
                    <td>
                      <button className="btn-ghost" onClick={() => handleDelete(r)} style={{ color: '#f87171' }}>
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={isAdmin ? 8 : 7} className="empty-row">No respondents logged for this project yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="pagination">
          <button className="btn-ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span>Page {page + 1} of {totalPages}</span>
          <button className="btn-ghost" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </div>
      </Reveal>
    </div>
  )
}
