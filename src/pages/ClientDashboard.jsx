import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import Reveal from '../components/Reveal'

const TRACK_BASE = 'https://pack-talk-dashboard.vercel.app/api/track'
const EMPTY_PROJECT = { project_id: '', project_name: '', target: '', loi: '', ir: '', country: '', launch_date: '', survey_link: '' }

export default function ClientDashboard() {
  const { user, profile } = useAuth()
  const [projects, setProjects] = useState([])
  const [responses, setResponses] = useState([])
  const [quotas, setQuotas] = useState([])
  const [loading, setLoading] = useState(true)
  const [copiedKey, setCopiedKey] = useState(null)

  const [quotaFile, setQuotaFile] = useState(null)
  const [quotaPreview, setQuotaPreview] = useState([])
  const [quotaError, setQuotaError] = useState(null)
  const [quotaProjectId, setQuotaProjectId] = useState('')
  const [quotaMessage, setQuotaMessage] = useState(null)
  const [quotaBusy, setQuotaBusy] = useState(false)

  const [projectForm, setProjectForm] = useState(EMPTY_PROJECT)
  const [projectMessage, setProjectMessage] = useState(null)
  const [projectBusy, setProjectBusy] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: cpData } = await supabase.from('client_projects').select('project_id').eq('client_id', user.id)
    const projectIds = (cpData || []).map((cp) => cp.project_id)

    if (projectIds.length === 0) {
      setProjects([])
      setResponses([])
      setQuotas([])
      setLoading(false)
      return
    }

    const { data: projectData } = await supabase.from('projects').select('*').in('project_id', projectIds)
    const { data: responseData } = await supabase.from('responses').select('*').in('project_id', projectIds).eq('deleted', false)
    const { data: quotaData } = await supabase.from('project_quotas').select('*').in('project_id', projectIds)

    setProjects(projectData || [])
    setResponses(responseData || [])
    setQuotas(quotaData || [])
    if (!quotaProjectId && projectData && projectData.length > 0) {
      setQuotaProjectId(projectData[0].project_id)
    }
    setLoading(false)
  }

  async function createProject(e) {
    e.preventDefault()
    setProjectBusy(true)
    setProjectMessage(null)

    const { error: projectError } = await supabase.from('projects').insert({
      project_id: projectForm.project_id.trim(),
      project_name: projectForm.project_name.trim(),
      country: projectForm.country.trim(),
      target: Number(projectForm.target) || 0,
      loi: Number(projectForm.loi) || 0,
      ir: Number(projectForm.ir) || 0,
      launch_date: projectForm.launch_date || new Date().toISOString().slice(0, 10),
      survey_link: projectForm.survey_link.trim(),
      status: 'Live',
      created_by: user.id,
    })

    if (projectError) {
      setProjectBusy(false)
      setProjectMessage({ type: 'error', text: projectError.message })
      return
    }

    const { error: linkError } = await supabase.from('client_projects').insert({
      client_id: user.id,
      project_id: projectForm.project_id.trim(),
    })

    setProjectBusy(false)
    if (linkError) {
      setProjectMessage({ type: 'error', text: `Project created but linking failed: ${linkError.message}` })
    } else {
      setProjectMessage({ type: 'success', text: `Survey "${projectForm.project_id}" created and live.` })
      setProjectForm(EMPTY_PROJECT)
      load()
    }
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

  function copyAllLinks(project_id) {
    const links = getTrackingLinks(project_id)
    const formatted = [
      `PackTalk Tracking Links — ${project_id}`,
      '',
      ...links.map((l) => `${l.label}: ${l.url}`),
      '',
      'Replace [UID], [COUNTRY], and [AGE_BAND] with your survey tool\'s dynamic variables. Country and Age Band are optional.',
    ].join('\n')

    navigator.clipboard.writeText(formatted)
    setCopiedKey(project_id + '_all')
    setTimeout(() => setCopiedKey(null), 1500)
  }

  function statFor(project_id) {
    const rows = responses.filter((r) => r.project_id === project_id)
    return {
      total: rows.length,
      completed: rows.filter((r) => r.completed).length,
      terminated: rows.filter((r) => r.status === 'Terminated').length,
      quotaFull: rows.filter((r) => r.quota_status === 'Full').length,
    }
  }

  function quotaRowsFor(project_id) {
    const projectQuotas = quotas.filter((q) => q.project_id === project_id)
    return projectQuotas.map((q) => {
      const done = responses.filter(
        (r) => r.project_id === project_id && r.country === q.country && r.age_band === q.age_band && r.completed
      ).length
      return {
        ...q,
        done,
        toGo: Math.max(q.target_count - done, 0),
      }
    })
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
          load()
        }
      } catch (err) {
        setQuotaBusy(false)
        setQuotaMessage({ type: 'error', text: 'Could not process this file.' })
      }
    }
    reader.readAsBinaryString(quotaFile)
  }

  if (loading) return <div className="page"><p>Loading…</p></div>

  return (
    <div className="page">
      <h1>Welcome, {profile?.full_name || profile?.email}</h1>
      <p className="page-sub">Your projects, tracking links, and quotas.</p>

      <Reveal>
      <div className="card" style={{ maxWidth: 640, marginBottom: 20 }}>
        <h2 className="card-title">Create New Survey</h2>
        <p className="card-hint">This creates a new project under your account, live immediately.</p>
        <form onSubmit={createProject} className="form-grid">
          <label>Project ID
            <input required value={projectForm.project_id} onChange={(e) => setProjectForm({ ...projectForm, project_id: e.target.value })} placeholder="e.g. TOLUNA045" />
          </label>
          <label>Project Name
            <input required value={projectForm.project_name} onChange={(e) => setProjectForm({ ...projectForm, project_name: e.target.value })} placeholder="e.g. Consumer Panel Wave 3" />
          </label>
          <label>Country
            <input required value={projectForm.country} onChange={(e) => setProjectForm({ ...projectForm, country: e.target.value })} placeholder="e.g. India" />
          </label>
          <label>Target
            <input type="number" value={projectForm.target} onChange={(e) => setProjectForm({ ...projectForm, target: e.target.value })} />
          </label>
          <label>LOI (min)
            <input type="number" value={projectForm.loi} onChange={(e) => setProjectForm({ ...projectForm, loi: e.target.value })} />
          </label>
          <label>IR (%)
            <input type="number" value={projectForm.ir} onChange={(e) => setProjectForm({ ...projectForm, ir: e.target.value })} />
          </label>
          <label>Launch Date
            <input type="date" value={projectForm.launch_date} onChange={(e) => setProjectForm({ ...projectForm, launch_date: e.target.value })} />
          </label>
          <label>Survey Link
            <input required value={projectForm.survey_link} onChange={(e) => setProjectForm({ ...projectForm, survey_link: e.target.value })} placeholder="e.g. https://forms.gle/xxxxx" />
          </label>
          {projectMessage && <div className={projectMessage.type === 'error' ? 'auth-error' : 'auth-success'}>{projectMessage.text}</div>}
          <button className="btn-primary" type="submit" disabled={projectBusy}>{projectBusy ? 'Creating…' : 'Create Survey'}</button>
        </form>
      </div>
      </Reveal>

      {projects.length === 0 && (
        <Reveal>
        <div className="card">
          <p>You haven't created any surveys yet. Use the form above to get started.</p>
        </div>
        </Reveal>
      )}

      {projects.map((p) => {
        const stats = statFor(p.project_id)
        const quotaRows = quotaRowsFor(p.project_id)
        return (
          <Reveal key={p.project_id}>
          <div className="card" style={{ marginBottom: 20 }}>
            <h2 className="card-title">{p.project_name} ({p.project_id})</h2>
            <p className="card-hint">{p.country} · Target {p.target} · LOI {p.loi} min · IR {p.ir}%</p>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '16px 0' }}>
              <div className="kpi-mini"><span className="kpi-num">{stats.total}</span><span className="kpi-label">Total</span></div>
              <div className="kpi-mini"><span className="kpi-num">{stats.completed}</span><span className="kpi-label">Completed</span></div>
              <div className="kpi-mini"><span className="kpi-num">{stats.terminated}</span><span className="kpi-label">Terminated</span></div>
              <div className="kpi-mini"><span className="kpi-num">{stats.quotaFull}</span><span className="kpi-label">Quota Full</span></div>
            </div>

            {quotaRows.length > 0 && (
              <>
                <h3 style={{ fontSize: 15, marginBottom: 8 }}>Quota Progress</h3>
                <div className="table-wrap" style={{ marginBottom: 16 }}>
                  <table className="data-table small">
                    <thead>
                      <tr><th>Country</th><th>Age Band</th><th>Target</th><th>Done</th><th>To Go</th><th>Survey URL</th></tr>
                    </thead>
                    <tbody>
                      {quotaRows.map((q) => (
                        <tr key={q.country + q.age_band}>
                          <td>{q.country}</td>
                          <td>{q.age_band}</td>
                          <td>{q.target_count}</td>
                          <td>{q.done}</td>
                          <td>{q.toGo}</td>
                          <td>{q.survey_url ? <a href={q.survey_url} target="_blank" rel="noreferrer">Open</a> : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <h3 style={{ fontSize: 15, margin: 0 }}>Tracking Links</h3>
              <button type="button" className="btn-ghost" onClick={() => copyAllLinks(p.project_id)}>
                {copiedKey === (p.project_id + '_all') ? 'Copied All ✓' : 'Copy All Links'}
              </button>
            </div>
            <p className="card-hint">
              Paste these into your survey tool's redirect/thank-you-page settings, replacing <code>[UID]</code>, <code>[COUNTRY]</code>, and <code>[AGE_BAND]</code> with your tool's variables. Country and age band are optional but power the Quota Progress table above.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
              {getTrackingLinks(p.project_id).map((link) => (
                <div key={link.status} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span className="badge badge-gray" style={{ minWidth: 90, textAlign: 'center' }}>{link.label}</span>
                  <input
                    readOnly
                    value={link.url}
                    onFocus={(e) => e.target.select()}
                    style={{ flex: 1, minWidth: 240, fontFamily: 'monospace', fontSize: 12 }}
                  />
                  <button type="button" className="btn-ghost" onClick={() => copyLink(p.project_id + link.status, link.url)}>
                    {copiedKey === (p.project_id + link.status) ? 'Copied ✓' : 'Copy'}
                  </button>
                </div>
              ))}
            </div>
          </div>
          </Reveal>
        )
      })}

      {projects.length > 0 && (
        <Reveal delay={40}>
        <div className="card" style={{ maxWidth: 640 }}>
          <h2 className="card-title">Upload Quota Brief</h2>
          <p className="card-hint">
            Upload an Excel/CSV file with columns: <code>Country, Age Band, Target Count, Survey URL</code>. One row per country + age band. Re-uploading updates existing rows for the same country/age band.
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
