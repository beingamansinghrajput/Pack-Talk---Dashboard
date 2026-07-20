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
  age_band: '',
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
  const [fileError, setFileError] = useState(null)
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
      age_band: form.age_band || null,
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
    setFileError(null)
    setPreview([])
    if (!f) return

    const validExtensions = ['.xlsx', '.xls', '.csv']
    const hasValidExtension = validExtensions.some((ext) => f.name.toLowerCase().endsWith(ext))
    if (!hasValidExtension) {
      setFileError('Unsupported file type. Please upload a .xlsx, .xls, or .csv file.')
      setFile(null)
      return
    }

    if (f.size === 0) {
      setFileError('This file appears to be empty.')
      setFile(null)
      return
    }

    setFile(f)
    const reader = new FileReader()
    reader.onerror = () => {
      setFileError('Could not read this file. It may be corrupted — try re-exporting it and uploading again.')
      setFile(null)
    }
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary', cellDates: true })
        if (!wb.SheetNames || wb.SheetNames.length === 0) {
          setFileError('No sheets found in this file.')
          setFile(null)
          return
        }
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json(sheet, { defval: '' })

        if (json.length === 0) {
          setFileError('This file has no data rows.')
          setFile(null)
          return
        }

        const firstRow = json[0]
        const hasUidColumn = 'UID' in firstRow || 'uid' in firstRow
        const hasStartColumn = 'Start Time' in firstRow || 'start_time' in firstRow
        if (!hasUidColumn || !hasStartColumn) {
          setFileError('Missing required columns. Your file must include at least "UID" and "Start Time" columns.')
          setFile(null)
          return
        }

        setPreview(json.slice(0, 5))
      } catch (err) {
        setFileError('Could not parse this file. Make sure it is a valid Excel (.xlsx) or CSV file, not corrupted or password-protected.')
        setFile(null)
      }
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
    reader.onerror = () => {
      setBulkBusy(false)
      setBulkMessage({ type: 'error', text: 'Could not read the file during upload. Please try again.' })
    }
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary', cellDates: true })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json(sheet, { defval: '' })

        const invalidRows = []
        const payload = []

        json.forEach((row, idx) => {
          const uid = String(row.UID || row.uid || '').trim()
          const startTimeRaw = row['Start Time'] || row.start_time
          const rowNum = idx + 2 // +2 accounts for header row + 0-index

          if (!uid) {
            invalidRows.push(`Row ${rowNum}: missing UID`)
            return
          }
          if (!startTimeRaw) {
            invalidRows.push(`Row ${rowNum}: missing Start Time`)
            return
          }
          const startDate = new Date(startTimeRaw)
          if (isNaN(startDate.getTime())) {
            invalidRows.push(`Row ${rowNum}: invalid Start Time format`)
            return
          }
          const endTimeRaw = row['End Time'] || row.end_time || null
          if (endTimeRaw) {
            const endDate = new Date(endTimeRaw)
            if (!isNaN(endDate.getTime()) && endDate < startDate) {
              invalidRows.push(`Row ${rowNum}: End Time is before Start Time`)
              return
            }
          }

          payload.push({
            project_id: bulkProjectId,
            uid,
            start_time: startTimeRaw,
            end_time: endTimeRaw,
            country: row.Country || row.country || '',
            age_band: row['Age Band'] || row.age_band || null,
            screener_pass: String(row['Screener Pass'] ?? row.screener_pass ?? 'true').toLowerCase() !== 'no' && String(row['Screener Pass'] ?? row.screener_pass ?? 'true').toLowerCase() !== 'false',
            quota_status: row['Quota Status'] || row.quota_status || 'Open',
            completed: ['yes', 'true', true].includes(String(row['Survey Completed'] ?? row.completed ?? '').toLowerCase()),
            created_by: user.id,
          })
        })

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
          const reason = invalidRows.length > 0
            ? `All rows were invalid. First issues: ${invalidRows.slice(0, 5).join('; ')}`
            : 'No valid rows found. Check column headers: UID, Start Time, End Time, Country, Age Band, Screener Pass, Quota Status, Survey Completed.'
          setBulkMessage({ type: 'error', text: reason })
          setBulkBusy(false)
          return
        }

        const { error } = await supabase.from('responses').upsert(deduped, { onConflict: 'project_id,uid', count: 'exact' })
        setBulkBusy(false)
        if (error) {
          setBulkMessage({ type: 'error', text: error.message })
        } else {
          let text = `${deduped.length} respondent rows uploaded to ${bulkProjectId}.`
          const problems = []
          if (skippedInFile.length > 0) problems.push(`${skippedInFile.length} duplicate UID(s) within the file skipped`)
          if (invalidRows.length > 0) problems.push(`${invalidRows.length} row(s) skipped due to missing/invalid data`)
          if (problems.length > 0) text += ` (${problems.join('; ')}.)`
          setBulkMessage({ type: invalidRows.length > 0 || skippedInFile.length > 0 ? 'warning' : 'success', text })
          setFile(null)
          setPreview([])
        }
      } catch (err) {
        setBulkBusy(false)
        setBulkMessage({ type: 'error', text: 'Could not process this file. It may be corrupted or in an unsupported format.' })
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
            Expected columns: <code>UID, Start Time, End Time, Country, Age Band, Screener Pass, Quota Status, Survey Completed</code>
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

          {fileError && <div className="auth-error" style={{ marginTop: 8 }}>{fileError}</div>}

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

          {bulkMessage && (
            <div className={bulkMessage.type === 'error' ? 'auth-error' : bulkMessage.type === 'warning' ? 'auth-warning' : 'auth-success'}>
              {bulkMessage.text}
            </div>
          )}
          <button className="btn-primary" onClick={handleBulkUpload} disabled={bulkBusy || !file} style={{ marginTop: 12 }}>
            {bulkBusy ? 'Uploading…' : 'Upload All Rows'}
          </button>
        </div>
      </div>
      </Reveal>
    </div>
  )
}
