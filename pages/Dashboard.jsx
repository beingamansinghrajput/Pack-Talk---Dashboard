import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import Reveal from '../components/Reveal'
import { handleTiltMove, handleTiltLeave } from '../lib/tilt'

const STATUS_META = {
  Completed: { label: 'Complete', color: '#16A34A', icon: '✓' },
  Terminated: { label: 'Terminate', color: '#DC2626', icon: '⛔' },
  QuotaFull: { label: 'Quota Full', color: '#D97706', icon: '⚠' },
  Disqualify: { label: 'Disqualify', color: '#6B7280', icon: '✕' },
}

function isToday(dateStr) {
  const d = new Date(dateStr)
  const t = new Date()
  return d.toDateString() === t.toDateString()
}

function isThisMonth(dateStr) {
  const d = new Date(dateStr)
  const t = new Date()
  return d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear()
}

export default function Dashboard() {
  const [projects, setProjects] = useState([])
  const [responses, setResponses] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: projData }, { data: respData }] = await Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('responses').select('project_id, status, start_time, country'),
    ])
    setProjects(projData || [])
    setResponses(respData || [])
    setLoading(false)
  }

  const todayCounts = useMemo(() => {
    const c = { Completed: 0, Terminated: 0, QuotaFull: 0, Disqualify: 0 }
    responses.filter((r) => isToday(r.start_time)).forEach((r) => c[r.status]++)
    return c
  }, [responses])

  const monthCounts = useMemo(() => {
    const c = { Completed: 0, Terminated: 0, QuotaFull: 0, Disqualify: 0 }
    responses.filter((r) => isThisMonth(r.start_time)).forEach((r) => c[r.status]++)
    return c
  }, [responses])

  const projectRows = useMemo(() => {
    return projects
      .filter((p) =>
        (p.project_id + p.project_name + p.country).toLowerCase().includes(search.toLowerCase())
      )
      .map((p) => {
        const rows = responses.filter((r) => r.project_id === p.project_id)
        const counts = { Completed: 0, Terminated: 0, QuotaFull: 0, Disqualify: 0 }
        rows.forEach((r) => counts[r.status]++)
        return { ...p, totalHits: rows.length, counts }
      })
  }, [projects, responses, search])

  if (loading) return <div className="page-loading">Loading dashboard…</div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Good day 👋</h1>
          <p className="page-sub">Live respondent outcomes across every active project</p>
        </div>
      </div>

      <Reveal>
        <section>
          <h2 className="section-title">Today</h2>
          <div className="kpi-grid">
            {Object.entries(STATUS_META).map(([key, meta], i) => (
              <div
                key={key}
                className="kpi-card kpi-tilt"
                style={{ borderTopColor: meta.color, animationDelay: `${i * 0.06}s` }}
                onMouseMove={handleTiltMove}
                onMouseLeave={handleTiltLeave}
              >
                <span className="kpi-label">{meta.label}</span>
                <span className="kpi-value">{todayCounts[key]}</span>
                <span className="kpi-icon" style={{ color: meta.color }}>{meta.icon}</span>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      <Reveal delay={80}>
        <section>
          <h2 className="section-title">This Month</h2>
          <div className="kpi-grid">
            {Object.entries(STATUS_META).map(([key, meta], i) => (
              <div
                key={key}
                className="kpi-card kpi-tilt"
                style={{ borderTopColor: meta.color, animationDelay: `${i * 0.06}s` }}
                onMouseMove={handleTiltMove}
                onMouseLeave={handleTiltLeave}
              >
                <span className="kpi-label">{meta.label}</span>
                <span className="kpi-value">{monthCounts[key]}</span>
                <span className="kpi-icon" style={{ color: meta.color }}>{meta.icon}</span>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      <Reveal delay={140}>
      <section>
        <div className="section-header-row">
          <h2 className="section-title">Projects</h2>
          <input
            className="search-input"
            placeholder="Search by Project ID, name, or country…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Project ID</th>
                <th>Country</th>
                <th>Target</th>
                <th>LOI/IR</th>
                <th>Total Hits</th>
                <th>Completed</th>
                <th>Terminated</th>
                <th>QuotaFull</th>
                <th>Disqualify</th>
              </tr>
            </thead>
            <tbody>
              {projectRows.map((p) => (
                <tr key={p.project_id}>
                  <td>
                    <Link className="link" to={`/projects/${p.project_id}`}>{p.project_id}</Link>
                    <div className="cell-sub">{p.project_name}</div>
                  </td>
                  <td>{p.country}</td>
                  <td>{p.target}</td>
                  <td><span className="pill">LOI {p.loi} | IR {p.ir}%</span></td>
                  <td>{p.totalHits}</td>
                  <td className="text-green">{p.counts.Completed}</td>
                  <td className="text-red">{p.counts.Terminated}</td>
                  <td className="text-amber">{p.counts.QuotaFull}</td>
                  <td className="text-gray">{p.counts.Disqualify}</td>
                </tr>
              ))}
              {projectRows.length === 0 && (
                <tr><td colSpan={9} className="empty-row">No projects yet. Ask an admin to add one under Manage Projects.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      </Reveal>
    </div>
  )
}
