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

  const [statusFilter, setStatusFilter] = useState('')
  const [countryFilter, setCountryFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    setPage(0)
  }, [statusFilter, countryFilter, dateFrom, dateTo])

  useEffect(() => {
    load()
  }, [projectId, page, statusFilter, countryFilter, dateFrom, dateTo])

  function buildQuery(base) {
    let q = base.eq('project_id', projectId).eq('deleted', false)
    if (statusFilter) q = q.eq('status', statusFilter)
    if (countryFilter.trim()) q = q.ilike('country', `%${countryFilter.trim()}%`)
    if (dateFrom) q = q.gte('start_time', dateFrom)
    if (dateTo) q = q.lte('start_time', dateTo + 'T23:59:59')
    return q
  }

  async function load() {
    setLoading(true)
    const { data: proj } = await supabase.from('projects').select('*').eq('project_id', projectId).single()
    setProject(proj)

    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const query = buildQuery(supabase.from('responses').select('*', { count: 'exact' }))
      .order('start_time', { ascending: false })
      .range(from, to)

    const { data, count } = await query
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

  async function handleExport() {
    const query = buildQuery(supabase.from('responses').select('*')).order('start_time', { ascending: false })
    const { data, error } = await query

    if (error) {
      setActionMessage({ type: 'error', text: 'Export failed: ' + error.message })
      return
    }
    if (!data || data.length === 0) {
      setActionMessage({ type: 'error', text: 'No rows to export for the current filters.' })
      return
    }

    const headers = ['UID', 'Start Time', 'End Time', 'Duration (min)', 'Country', 'Status']
    const csvRows = data.map((r) => [
      r.uid,
      r.start_time ? new Date(r.start_time).toLocaleString() : '',
      r.end_time ? new Date(r.end_time).toLocaleString() : '',
      r.duration_min ?? '',
      r.country ?? '',
      r.status ?? '',
    ])

    const escapeCell = (cell) => {
      const s = String(cell ?? '')
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`
      }
      return s
    }

    const csvContent = [headers, ...csvRows].map((row) => row.map(escapeCell).join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `${projectId}_export_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  function clearFilters() {
    setStatusFilter('')
    setCountryFilter('')
    setDateFrom('')
    setDateTo('')
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasActiveFilters = statusFilter || countryFilter || dateFrom || dateTo

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
        <h2 className="card-title">Filters</h2>
        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
          <label>Status
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              <option value="Completed">Completed</option>
              <option value="Terminated">Terminated</option>
              <option value="QuotaFull">QuotaFull</option>
              <option value="Disqualify">Disqualify</option>
            </select>
          </label>
          <label>Country
            <input value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)} placeholder="Search country…" />
          </label>
          <label>From Date
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label>To Date
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          {hasActiveFilters && (
            <button className="btn-ghost" onClick={clearFilters}>Clear Filters</button>
          )}
          <button className="btn-primary" onClick={handleExport}>Download CSV</button>
        </div>
      </div>
      </Reveal>

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
                <tr><td colSpan={isAdmin ? 8 : 7} className="empty-row">No respondents match the current filters.</td></tr>
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
