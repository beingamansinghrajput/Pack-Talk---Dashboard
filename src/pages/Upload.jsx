import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import Reveal from '../components/Reveal'

const EMPTY_FORM = {
  project_id: '',
  uid: '',
  start_time: '',
  end_time: '',
  country: '',
  screener_pass: 'true',
  quota_status: 'Open',
  completed: 'false',
}

export default function Upload() {
  const { user } = useAuth()
  const [projects, setProjects] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)

  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState([])
  const [bulkProjectId, setBulkProjectId] = useState('')
  const [bulkMessage, setBulkMessage] = useState(null)
  const [bulkBusy, setBulkBusy] = useState(false)

  useEffect(() => {
    supabase.from('projects').select('project_id, project_name').order('project_id').then(({ data }) => {
      setProjects(data || [])
    })
  }, [])

  function validateManualForm() {
    if (!form.project_id) return 'Please select a project.'
    if (!form.uid || !form.uid.trim()) return 'Respondent UID cannot be empty.'
    if (!form.start_time) return 'Start time is required.'
    if (form.end_time && new Date(form.end_time) < new Date(form.start_time)) {
      return 'End time cannot be before start time.'
    }
    if (!form.country || !form.country.trim()) return 'Country is required.'
    return null
  }

  async function handleManualSubmit(e) {
    e.preventDefault()
    setMessage(null)

    const validationError = validateManualForm()
    if (validationError) {
      setMessage({ type: 'error', text: validationError })
      return
    }

    setBusy(true)

    const { data: existing, error: checkError } = await supabase
      .from('responses')
      .select('id')
      .eq('project_id', form.project_id)
      .eq('uid', form.uid.trim())
      .maybeSingle()

    if (checkError) {
      setBusy(false)
      setMessage({ type: 'error', text: checkError.message })
      return
    }

    if (existing) {
      setBusy(false)
      setMessage({ type: 'error', text: `UID "${form.uid}" already exists for project ${form.project_id}. Duplicate entries are not allowed.` })
      return
    }

    const { error } = await supabase.from('responses').insert({
      project_id: form.project_id,
      uid: form.uid.trim(),
      start_time: form.start_time,
      end_time: form.end_time || null,
      country: form.country.trim(),
      screener_pass: form.screener_pass === 'true',
      quota_status: form.quota_status,
      completed: form.completed === 'true',
      created_by: user.id,
    })
    setBusy(false)
    if (error) {
      setMessage({ type: 'error', text: error.message })
    } else {
      setMessage({ type: 'success', text: `Respondent ${form.uid} punched in successfully.` })
      setForm({ ...EMPTY_FORM, project_id: form.project_id })
    }
  }

  function handleFile(e) {
    const f = e.target.files[0]
    if (!f) return
    setFile(f)
    const reader = new FileReader()
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'binary', cellDates: true })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json(sheet, { defval: '' })
      setPreview(json.slice(0, 5))
    }
    reader.readAsBinaryString(f)
  }

  async function handleBulkUpload() {
    if (!file || !bulkProjectId) {
      setBulkMessage({ type: 'error', text: 'Pick a project and a file first.' })
      return
    }
    setBulkBusy(true)
    setBulkMessage(null)

    const reader = new FileReader()
    reader.onload = async (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'binary', cellDates: true })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json(sheet, { defval: '' })

      const payload = json.map((row) => ({
        project_id: bulkProjectId,
        uid: String(row.UID || row.uid || '').trim(),
        start_time: row['Start Time'] || row.start_time,
        end_time: row['End Time'] || row.end_time || null,
        country: row.Country || row.country || '',
        screener_pass: String(row['Screener Pass'] ?? row.screener_pass ?? 'true').toLowerCase() !== 'no' && String(row['Screener Pass'] ?? row.screener_pass ?? 'true').toLowerCase() !== 'false',
        quota_status: row['Quota Status'] || row.quota_status || 'Open',
        completed: ['yes', 'true', true].includes(String(row['Survey Completed'] ?? row.completed ?? '').toLowerCase()),
        created_by: user.id,
      })).filter((r) => r.uid && r.start_time)

      const seen = new Set()
      const deduped = []
      const skippedInFile = []
      for (const row of payload) {
        const key = `${row.project_id}::${row.uid}`
        if (seen.has(key)) {
          skippedInFile.push(row.uid)
        } else {
          seen.add(key)
          deduped.push(row)
        }
      }

      if (deduped.length === 0) {
        setBulkMessage({ type: 'error', text: 'No valid rows found. Check column headers: UID, Start Time, End Time, Country, Screener Pass, Quota Status, Survey Completed.' })
        setBulkBusy(false)
        return
      }

      const { error, count } = await supabase.from('responses').upsert(deduped, { onConflict: 'project_id,uid', count: 'exact' })
      setBulkBusy(false)
      if (error) {
        setBulkMessage({ type: 'error', text: error.message })
      } else {
        let text = `${deduped.length} respondent rows uploaded to ${bulkProjectId}.`
        if (skippedInFile.length > 0) {
          text += ` (${skippedInFile.length} duplicate UID(s) within the file were skipped: ${skippedInFile.slice(0, 5).join(', ')}${skippedInFile.length > 5 ? '…' : ''})`
        }
        setBulkMessage({ type: 'success', text })
        setFile(null)
        setPreview([])
      }
    }
    reader.readAsBinaryString(file)
  }

  return (
    <div className="page">
      <h1>Punch In Survey Data</h1>
      <p className="page-sub">Log respondents one at a time, or upload a full Excel export at once.</p>

      <Reveal>
      <div className="two-col">
        <div className="card">
          <h2 className="card-title">Manual Entry</h2>
          <form onSubmit={handleManualSubmit} className="form-grid">
            <label>Project
              <select required value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}>
                <option value="">Select project…</option>
                {projects.map((p) => <option key={p.project_id} value={p.project_id}>{p.project_id} — {p.project_name}</option>)}
              </select>
            </label>
            <label>Respondent UID
              <input required value={form.uid} onChange={(e) => setForm({ ...form, uid: e.target.value })} placeholder="e.g. xhgfdrftyguhiPV03" />
            </label>
            <label>Start Time
              <input required type="datetime-local" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
            </label>
            <label>End Time
              <input type="datetime-local" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
            </label>
            <label>Country
              <input required value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="e.g. Netherlands" />
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
                <option value="false">No</option>
                <option value="true">Yes</option>
              </select>
            </label>
            {message && <div className={message.type === 'error' ? 'auth-error' : 'auth-success'}>{message.text}</div>}
            <button className="btn-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Punch In'}</button>
          </form>
        </div>

        <div className="card">
          <h2 className="card-title">Bulk Excel Upload</h2>
          <p className="card-hint">
            Expected columns: <code>UID, Start Time, End Time, Country, Screener Pass, Quota Status, Survey Completed</code>
          </p>
          <label className="field-label">Target Project
            <select value={bulkProjectId} onChange={(e) => setBulkProjectId(e.target.value)}>
              <option value="">Select project…</option>
              {projects.map((p) => <option key={p.project_id} value={p.project_id}>{p.project_id} — {p.project_name}</option>)}
            </select>
          </label>
          <label className="field-label">Excel File (.xlsx / .csv)
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} />
          </label>

          {preview.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table className="data-table small">
                <thead>
                  <tr>{Object.keys(preview[0]).map((k) => <th key={k}>{k}</th>)}</tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i}>{Object.values(row).map((v, j) => <td key={j}>{String(v)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
              <p className="card-hint">Showing first {preview.length} rows as a preview.</p>
            </div>
          )}

          {bulkMessage && <div className={bulkMessage.type === 'error' ? 'auth-error' : 'auth-success'}>{bulkMessage.text}</div>}
          <button className="btn-primary" onClick={handleBulkUpload} disabled={bulkBusy} style={{ marginTop: 12 }}>
            {bulkBusy ? 'Uploading…' : 'Upload All Rows'}
          </button>
        </div>
      </div>
      </Reveal>
    </div>
  )
}
