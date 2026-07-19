import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
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
  const [project, setProject] = useState(null)
  const [rows, setRows] = useState([])
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

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
      .order('start_time', { ascending: false })
      .range(from, to)

    setRows(data || [])
    setTotal(count || 0)
    setLoading(false)
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="page">
      <div className="breadcrumb">
        <Link to="/">Dashboard</Link> <span>›</span> <span>Project {projectId}</span>
      </div>
      <h1>Project Details: {projectId}</h1>
      {project && <p className="page-sub">{project.project_name} · {project.country} · Target {project.target}</p>}

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
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="empty-row">Loading…</td></tr>}
              {!loading && rows.map((r, i) => (
                <tr key={r.id}>
                  <td>{page * PAGE_SIZE + i + 1}</td>
                  <td>{r.uid}</td>
                  <td>{new Date(r.start_time).toLocaleString()}</td>
                  <td>{r.end_time ? new Date(r.end_time).toLocaleString() : '—'}</td>
                  <td>{r.duration_min != null ? `${r.duration_min} min` : '—'}</td>
                  <td>{r.country}</td>
                  <td><span className={`badge ${STATUS_CLASS[r.status]}`}>{r.status}</span></td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={7} className="empty-row">No respondents logged for this project yet.</td></tr>
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
