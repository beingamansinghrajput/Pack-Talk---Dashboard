import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import Reveal from '../components/Reveal'

const EMPTY = { project_id: '', project_name: '', target: '', loi: '', ir: '', country: '', launch_date: '', survey_link: '' }
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
  const [search, setSearch] = useState('')

  const [quotaFile, setQuotaFile] = useState(null)
  const [quotaPreview, setQuotaPreview] = useState([])
  const [quotaError, setQuotaError] = useState(null)
  const [quotaProjectId, setQuotaProjectId] = useState('')
  const [quotaMessage, setQuotaMessage] = useState(null)
  const [quotaBusy, setQuotaBusy] = useState(false)

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
    if (!quotaProjectId && projectData && projectData.length > 0) {
      setQuotaProjectId(projectData[0].project_id)
    }
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
      survey_link: form.survey_link || null,
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

  async function updateSurveyLink(project_id, survey_link) {
    await supabase.from('projects').update({ survey_link: survey_link || null }).eq('project_id', project_id)
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
      { label: 'Complete', status: 'complete', url: `${TRACK_BASE}?project=${project_id}&uid=[UID]&status=complete&country=[COUNTRY]&age_band=[AGE_BAND]` },
      { label: 'Terminate', status: 'terminate', url: `${TRACK_BASE}?project=${project_id}&uid=[UID]&status=terminate&country=[COUNTRY]&age_band=[AGE_BAND]` },
      { label: 'Quota Full', status: 'quotafull', url: `${TRACK_BASE}?project=${project_id}&uid=[UID]&status=quotafull&country=[COUNTRY]&age_band=[AGE_BAND]` },
      { label: 'Security', status: 'security', url: `${TRACK_BASE}?project=${project_id}&uid=[UID]&status=security&country=[COUNTRY]&age_band=[AGE_BAND]` },
    ]
  }

  function copyLink(key, url) {
    navigator.clipboard.writeText(url)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 1500)
  }

  function handleQuotaFile(e) {
    const f = e.target.files[0]
    setQuotaError(null)
    setQuotaPreview([])
    if (!f) return

    const validExtensions = ['.xlsx', '.xls', '.csv']
    const hasValidExtension = validExtensions.some((ext) => f.name.toLowerCase().endsWith(ext))
    if (!hasValidExtension) {
      setQuotaError('Unsupported file type. Please upload a .xlsx, .xls, or .csv file.')
      setQuotaFile(null)
      return
    }

    setQuotaFile(f)
    const reader = new FileReader()
    reader.onerror = () => {
      setQuotaError('Could not read this file. Try re-exporting it and uploading again.')
      setQuotaFile(null)
    }
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json(sheet, { defval: '' })

        if (json.length === 0) {
          setQuotaError('This file has no data rows.')
          setQuotaFile(null)
          return
        }

        const firstRow = json[0]
        const hasCountry = 'Country' in firstRow
        const hasAgeBand = 'Age Band' in firstRow
        const hasTarget = 'Target Count' in firstRow
        if (!hasCountry || !hasAgeBand || !hasTarget) {
          setQuotaError('Missing required columns. File must include: Country, Age Band, Target Count, Survey URL.')
          setQuotaFile(null)
          return
        }

        setQuotaPreview(json.slice(0, 5))
      } catch (err) {
        setQuotaError('Could not parse this file. Make sure it is a valid Excel or CSV file.')
        setQuotaFile(null)
      }
    }
    reader.readAsBinaryString(f)
  }

  async function handleQuotaUpload() {
    if (!quotaFile || !quotaProjectId) {
      setQuotaMessage({ type: 'error', text: 'Pick a project and a file first.' })
      return
    }
    setQuotaBusy(true)
    setQuotaMessage(null)

    const reader = new FileReader()
    reader.onerror = () => {
      setQuotaBusy(false)
      setQuotaMessage({ type: 'error', text: 'Could not read the file during upload.' })
    }
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json(sheet, { defval: '' })

        const payload = []
        const invalidRows = []

        json.forEach((row, idx) => {
          const country = String(row.Country || '').trim()
          const ageBand = String(row['Age Band'] || '').trim()
          const targetCount = Number(row['Target Count'])
          const surveyUrl = String(row['Survey URL'] || '').trim()
          const rowNum = idx + 2

          if (!country || !ageBand || isNaN(targetCount)) {
            invalidRows.push(`Row ${rowNum}: missing Country, Age Band, or a valid Target Count`)
            return
          }

          payload.push({
            project_id: quotaProjectId,
            country,
            age_band: ageBand,
            target_count: targetCount,
            survey_url: surveyUrl || null,
          })
        })

        if (payload.length === 0) {
          setQuotaMessage({ type: 'error', text: `No valid rows found. ${invalidRows.slice(0, 3).join('; ')}` })
          setQuotaBusy(false)
          return
        }

        const { error } = await supabase
          .from('project_quotas')
          .upsert(payload, { onConflict: 'project_id,country,age_band' })

        setQuotaBusy(false)
        if (error) {
          setQuotaMessage({ type: 'error', text: error.message })
        } else {
          let text = `${payload.length} quota row(s) saved for ${quotaProjectId}.`
          if (invalidRows.length > 0) text += ` (${invalidRows.length} row(s) skipped.)`
          setQuotaMessage({ type: 'success', text })
          setQuotaFile(null)
          setQuotaPreview([])
        }
      } catch (err) {
        setQuotaBusy(false)
        setQuotaMessage({ type: 'error', text: 'Could not process this file.' })
      }
    }
    reader.readAsBinaryString(quotaFile)
  }

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return projects
    return projects.filter((p) =>
      `${p.project_id} ${p.project_name} ${p.country}`.toLowerCase().includes(q)
    )
  }, [projects, search])

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
          <label>Survey Link (optional)
            <input value={form.survey_link} onChange={(e) => setForm({ ...form, survey_link: e.target.value })} placeholder="e.g. https://forms.gle/xxxxx" />
          </label>
          {message && <div className={message.type === 'error' ? 'auth-error' : 'auth-success'}>{message.text}</div>}
          <button className="btn-primary" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create Project'}</button>
        </form>
      </div>
      </Reveal>

      <Reveal delay={80}>
      <div className="card">
        <div className="section-header-row">
          <h2 className="card-title">All Projects</h2>
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
              <tr><th>Project ID</th><th>Name</th><th>Country</th><th>Target</th><th>Status</th><th>Teams with Access</th><th></th></tr>
            </thead>
            <tbody>
              {filteredProjects.map((p) => {
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
              {filteredProjects.length === 0 && (
                <tr><td colSpan={7} className="empty-row">No projects match your search.</td></tr>
              )}
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
              Replace <code>[UID]</code>, <code>[COUNTRY]</code>, and <code>[AGE_BAND]</code> in each link with your survey tool's dynamic variables before handing it to a client or embedding it as a redirect URL. Country and age band are optional — they power the quota Done/To-Go tracking.
            </p>

            <div style={{ marginTop: 12, marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: 'var(--text-secondary, #999)' }}>
                Client's Survey Link
              </label>
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  defaultValue={projects.find((p) => p.project_id === linksProjectId)?.survey_link || ''}
                  onBlur={(e) => updateSurveyLink(linksProjectId, e.target.value)}
                  placeholder="e.g. https://forms.gle/xxxxx"
                  style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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

      {projects.length > 0 && (
        <Reveal delay={120}>
        <div className="card" style={{ maxWidth: 640 }}>
          <h2 className="card-title">Upload Quota Brief</h2>
          <p className="card-hint">
            Set quotas for any project yourself — no need to wait on a client. Upload an Excel/CSV file with columns: <code>Country, Age Band, Target Count, Survey URL</code>. One row per country + age band. Re-uploading updates existing rows for the same country/age band.
          </p>
          <label className="field-label">Project
            <select value={quotaProjectId} onChange={(e) => setQuotaProjectId(e.target.value)}>
              {projects.map((p) => <option key={p.project_id} value={p.project_id}>{p.project_name} ({p.project_id})</option>)}
            </select>
          </label>
          <label className="field-label">Quota File (.xlsx / .csv)
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleQuotaFile} />
          </label>

          {quotaError && <div className="auth-error" style={{ marginTop: 8 }}>{quotaError}</div>}

          {quotaPreview.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table className="data-table small">
                <thead>
                  <tr>{Object.keys(quotaPreview[0]).map((k) => <th key={k}>{k}</th>)}</tr>
                </thead>
                <tbody>
                  {quotaPreview.map((row, i) => (
                    <tr key={i}>{Object.values(row).map((v, j) => <td key={j}>{String(v)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
              <p className="card-hint">Showing first {quotaPreview.length} rows as a preview.</p>
            </div>
          )}

          {quotaMessage && (
            <div className={quotaMessage.type === 'error' ? 'auth-error' : 'auth-success'}>{quotaMessage.text}</div>
          )}
          <button className="btn-primary" onClick={handleQuotaUpload} disabled={quotaBusy || !quotaFile} style={{ marginTop: 12 }}>
            {quotaBusy ? 'Uploading…' : 'Upload Quota File'}
          </button>
        </div>
        </Reveal>
      )}
    </div>
  )
}
