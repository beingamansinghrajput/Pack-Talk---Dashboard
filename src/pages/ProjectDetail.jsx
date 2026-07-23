import { useEffect, useMemo, useState } from 'react'
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
const IR_MIN_SAMPLE = 5
const IR_GOOD_THRESHOLD = 10
const IR_WARN_THRESHOLD = 20

function getIRHealth(expectedIR, completedCount, terminatedCount) {
  const sample = completedCount + terminatedCount
  if (sample < IR_MIN_SAMPLE) {
    return { status: 'insufficient', label: 'Insufficient data yet', color: '#6B7280', actualIR: null, sample }
  }
  const actualIR = (completedCount / sample) * 100
  const diff = Math.abs(actualIR - expectedIR)

  if (diff <= IR_GOOD_THRESHOLD) {
    return { status: 'good', label: 'On target', color: '#16A34A', actualIR, sample }
  }
  if (diff <= IR_WARN_THRESHOLD) {
    return { status: 'warn', label: 'Watch closely', color: '#D97706', actualIR, sample }
  }
  return { status: 'bad', label: 'Off target', color: '#DC2626', actualIR, sample }
}

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

  const [irCounts, setIrCounts] = useState({ Completed: 0, Terminated: 0, QuotaFull: 0, Disqualify: 0 })
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  const [clearConfirmText, setClearConfirmText] = useState('')
  const [clearBusy, setClearBusy] = useState(false)

  useEffect(() => {
    setPage(0)
  }, [statusFilter, countryFilter, dateFrom, dateTo])

  useEffect(() => {
    load()
  }, [projectId, page, statusFilter, countryFilter, dateFrom, dateTo])

  useEffect(() => {
    setSelectedIds(new Set())
  }, [page, statusFilter, countryFilter, dateFrom, dateTo, projectId])

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

    const { data: allStatusRows } = await supabase
      .from('responses')
      .select('status')
      .eq('project_id', projectId)
      .eq('deleted', false)
    const counts = { Completed: 0, Terminated: 0, QuotaFull: 0, Disqualify: 0 }
    ;(allStatusRows || []).forEach((r) => { if (counts[r.status] !== undefined) counts[r.status]++ })
    setIrCounts(counts)
  }

  const irHealth = useMemo(() => {
    if (!project) return null
    return getIRHealth(Number(project.ir) || 0, irCounts.Completed, irCounts.Terminated)
  }, [project, irCounts])

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

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const allSelected = rows.length > 0 && rows.every((r) => prev.has(r.id))
      if (allSelected) return new Set()
      return new Set(rows.map((r) => r.id))
    })
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return
    const confirmed = window.confirm(
      `Remove ${selectedIds.size} selected respondent(s)? This can be restored later by an admin if needed.`
    )
    if (!confirmed) return

    setBulkBusy(true)
    const { error } = await supabase
      .from('responses')
      .update({ deleted: true })
      .in('id', Array.from(selectedIds))

    setBulkBusy(false)
    if (error) {
      setActionMessage({ type: 'error', text: error.message })
    } else {
      setActionMessage({ type: 'success', text: `${selectedIds.size} respondent(s) removed.` })
      setSelectedIds(new Set())
      load()
    }
  }

  async function handleClearAllTestData() {
    if (clearConfirmText !== projectId) return
    const confirmed = window.confirm(
      `This will remove ALL respondent rows for ${projectId} (every page, every filter — not just what's currently visible). This can be restored later by an admin if needed. Continue?`
    )
    if (!confirmed) return

    setClearBusy(true)
    const { error, count } = await supabase
      .from('responses')
      .update({ deleted: true })
      .eq('project_id', projectId)
      .eq('deleted', false)
      .select('id', { count: 'exact' })

    setClearBusy(false)
    if (error) {
      setActionMessage({ type: 'error', text: error.message })
    } else {
      setActionMessage({ type: 'success', text: `Cleared ${count ?? 'all'} respondent row(s) for ${projectId}.` })
      setClearConfirmText('')
      setSelectedIds(new Set())
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
  const allOnPageSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const colCount = isAdmin ? 9 : 7
  const clearUnlocked = clearConfirmText === projectId

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

      {project && irHealth && (
        <Reveal>
        <div className="card" style={{ borderLeft: `3px solid ${irHealth.color}` }}>
          <h2 className="card-title">IR Health Check</h2>
          {irHealth.status === 'insufficient' ? (
            <p className="card-hint">
              Not enough data yet ({irHealth.sample} Completed+Terminated so far — need at least {IR_MIN_SAMPLE} to evaluate).
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', margin: '12px 0' }}>
                <div>
                  <div className="card-hint">Expected IR</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{project.ir}%</div>
                </div>
                <div>
                  <div className="card-hint">Actual IR</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: irHealth.color }}>{irHealth.actualIR.toFixed(1)}%</div>
                </div>
                <div>
                  <div className="card-hint">Status</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: irHealth.color }}>{irHealth.label}</div>
                </div>
              </div>
              <div className="table-wrap">
                <table className="data-table small">
                  <thead>
                    <tr><th></th><th>Expected (of {irCounts.Completed + irCounts.Terminated})</th><th>Actual</th></tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Completed</td>
                      <td>{Math.round((irCounts.Completed + irCounts.Terminated) * (Number(project.ir) || 0) / 100)}</td>
                      <td className="text-green">{irCounts.Completed}</td>
                    </tr>
                    <tr>
                      <td>Terminated</td>
                      <td>{Math.round((irCounts.Completed + irCounts.Terminated) * (100 - (Number(project.ir) || 0)) / 100)}</td>
                      <td className="text-red">{irCounts.Terminated}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="card-hint" style={{ marginTop: 8 }}>
                QuotaFull ({irCounts.QuotaFull}) and Disqualify ({irCounts.Disqualify}) are excluded from this ratio.
              </p>
            </>
          )}
        </div>
        </Reveal>
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
        <div className="section-header-row">
          <h2 className="card-title">Member Survey Overview</h2>
          {isAdmin && selectedIds.size > 0 && (
            <button
              className="btn-ghost"
              onClick={handleBulkDelete}
              disabled={bulkBusy}
              style={{ color: '#f87171' }}
            >
              {bulkBusy ? 'Removing…' : `Delete Selected (${selectedIds.size})`}
            </button>
          )}
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {isAdmin && (
                  <th style={{ width: 32 }}>
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleSelectAll}
                      disabled={rows.length === 0}
                    />
                  </th>
                )}
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
              {loading && <tr><td colSpan={colCount} className="empty-row">Loading…</td></tr>}
              {!loading && rows.map((r, i) => (
                <tr key={r.id}>
                  {isAdmin && (
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                      />
                    </td>
                  )}
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
                <tr><td colSpan={colCount} className="empty-row">No respondents match the current filters.</td></tr>
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

      {isAdmin && (
        <Reveal>
        <div className="card" style={{ borderLeft: '3px solid #DC2626', marginTop: 20 }}>
          <h2 className="card-title" style={{ color: '#f87171' }}>Danger Zone</h2>
          <p className="card-hint">
            Wipe every respondent row for <strong>{projectId}</strong> — not just this page, all of it, ignoring any filters above. Meant for clearing throwaway test data, not real respondents. This is a soft delete, so an admin can still restore it afterward if needed.
          </p>
          <label style={{ display: 'block', marginTop: 12, marginBottom: 8 }}>
            Type <code>{projectId}</code> to unlock
            <input
              value={clearConfirmText}
              onChange={(e) => setClearConfirmText(e.target.value)}
              placeholder={projectId}
              style={{ maxWidth: 240, marginTop: 6 }}
            />
          </label>
          <button
            className="btn-ghost"
            onClick={handleClearAllTestData}
            disabled={!clearUnlocked || clearBusy}
            style={{ color: '#f87171', opacity: clearUnlocked ? 1 : 0.5 }}
          >
            {clearBusy ? 'Clearing…' : `Clear All Test Data for ${projectId}`}
          </button>
        </div>
        </Reveal>
      )}
    </div>
  )
}
