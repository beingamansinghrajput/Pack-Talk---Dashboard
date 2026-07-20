import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import Reveal from '../components/Reveal'

const TRACK_BASE = 'https://pack-talk-dashboard.vercel.app/api/track'
const EMPTY_ENTRY = { project_id: '', uid: '', start_time: '', end_time: '', country: '', age_band: '', screener_pass: 'true', quota_status: 'Open', completed: 'false' }

export default function ClientDashboard() {
  const { user, profile } = useAuth()
  const [projects, setProjects] = useState([])
  const [responses, setResponses] = useState([])
  const [quotas, setQuotas] = useState([])
  const [loading, setLoading] = useState(true)
  const [copiedKey, setCopiedKey] = useState(null)
  const [form, setForm] = useState(EMPTY_ENTRY)
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)

  const [quotaFile, setQuotaFile] = useState(null)
  const [quotaPreview, setQuotaPreview] = useState([])
  const [quotaError, setQuotaError] = useState(null)
  const [quotaProjectId, setQuotaProjectId] = useState('')
  const [quotaMessage, setQuotaMessage] = useState(null)
  const [quotaBusy, setQuotaBusy] = useState(false)

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
    if (!form.project_id && projectData && projectData.length > 0) {
      setForm((f) => ({ ...f, project_id: projectData[0].project_id }))
      setQuotaProjectId(projectData[0].project_id)
    }
    setLoading(false)
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

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)

    const { data: dupe } = await supabase
      .from('responses')
      .select('id')
      .eq('project_id', form.project_id)
      .eq('uid', form.uid)
      .maybeSingle()

    if (dupe) {
      setMessage({ type: 'error', text: 'This UID has already been punched in for this project.' })
      setBusy(false)
      return
    }

    const { error } = await supabase.from('responses').insert({
      project_id: form.project_id,
      uid: form.uid,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      country: form.country || null,
      age_band: form.age_band || null,
      screener_pass: form.screener_pass === 'true',
      quota_status: form.quota_status,
      completed: form.completed === 'true',
    })

    setBusy(false)
    if (error) {
      setMessage({ type: 'error', text: error.message })
    } else {
      setMessage({ type: 'success', text: `Respondent ${form.uid} punched in successfully.` })
      setForm({ ...EMPTY_ENTRY, project_id: form.project_id })
      load()
    }
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
      <p className="page-sub">Your projects, tracking links, quotas, and survey data.</p>

      {projects.length === 0 && (
        <Reveal>
        <div className="card">
          <p>No projects have been assigned to your account yet. Contact your account manager.</p>
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

            <h3 style={{ fontSize: 15, marginBottom: 8 }}>Tracking Links</h3>
            <p className="card-hint">
              Paste these into your survey tool's redirect/thank-you-page settings, replacing <code>[UID]</code> with your tool's respondent ID variable.
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
        <div className="card" style={{ maxWidth: 640, marginBottom: 20 }}>
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

      {projects.length > 0 && (
        <Reveal delay={80}>
        <div className="card" style={{ maxWidth: 480 }}>
          <h2 className="card-title">Add a Respondent</h2>
          <form onSubmit={handleSubmit} className="form-grid">
            <label>Project
              <select value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}>
                {projects.map((p) => <option key={p.project_id} value={p.project_id}>{p.project_name} ({p.project_id})</option>)}
              </select>
            </label>
            <label>Respondent UID
              <input required value={form.uid} onChange={(e) => setForm({ ...form, uid: e.target.value })} placeholder="e.g. xhgfdrftyguhi" />
            </label>
            <label>Start Time
              <input type="datetime-local" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
            </label>
            <label>End Time
              <input type="datetime-local" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
            </label>
            <label>Country
              <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="e.g. India" />
            </label>
            <label>Age Band
              <input value={form.age_band} onChange={(e) => setForm({ ...form, age_band: e.target.value })} placeholder="e.g. 18-20" />
            </label>
            <label>Screener Passed?
              <select value={form.screener_pass} onChange={(e) => setForm({ ...form, screener_pass: e.target.value })}>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
            <label>Quota Status
              <select value={form.quota_status} onChange={(e) => setForm({ ...form, quota_status: e.target.value })}>
                <option value="Open">Open</option>
                <option value="Full">Full</option>
              </select>
            </label>
            <label>Survey Completed?
              <select value={form.completed} onChange={(e) => setForm({ ...form, completed: e.target.value })}>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
            {message && <div className={message.type === 'error' ? 'auth-error' : 'auth-success'}>{message.text}</div>}
            <button className="btn-primary" type="submit" disabled={busy}>{busy ? 'Punching in…' : 'Punch In'}</button>
          </form>
        </div>
        </Reveal>
      )}
    </div>
  )
}
