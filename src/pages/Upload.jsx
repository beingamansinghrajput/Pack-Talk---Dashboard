import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import Reveal from '../components/Reveal'

const EMPTY_PROJECT = { project_id: '', project_name: '', target: '', loi: '', ir: '', country: '', launch_date: '', survey_link: '' }

export default function Upload() {
  const { user } = useAuth()
  const [projects, setProjects] = useState([])

  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState([])
  const [fileError, setFileError] = useState(null)
  const [bulkProjectId, setBulkProjectId] = useState('')
  const [bulkMessage, setBulkMessage] = useState(null)
  const [bulkBusy, setBulkBusy] = useState(false)

  const [projectForm, setProjectForm] = useState(EMPTY_PROJECT)
  const [projectMessage, setProjectMessage] = useState(null)
  const [projectBusy, setProjectBusy] = useState(false)

  useEffect(() => {
    loadProjects()
  }, [])

  function loadProjects() {
    supabase.from('projects').select('project_id, project_name').order('project_id').then(({ data }) => {
      setProjects(data || [])
    })
  }

  async function createProject(e) {
    e.preventDefault()
    setProjectBusy(true)
    setProjectMessage(null)

    const { error } = await supabase.from('projects').insert({
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

    setProjectBusy(false)
    if (error) {
      setProjectMessage({ type: 'error', text: error.message })
    } else {
      setProjectMessage({ type: 'success', text: `Survey "${projectForm.project_id}" created and live.` })
      setProjectForm(EMPTY_PROJECT)
      loadProjects()
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
          const rowNum = idx + 2

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
      <p className="page-sub">Create a new survey, or upload a full Excel export of respondents.</p>

      <Reveal>
      <div className="two-col">
        <div className="card">
          <h2 className="card-title">Create New Survey</h2>
          <p className="card-hint">Creates a new project, live immediately.</p>
          <form onSubmit={createProject} className="form-grid">
            <label>Project ID
              <input required value={projectForm.project_id} onChange={(e) => setProjectForm({ ...projectForm, project_id: e.target.value })} placeholder="e.g. COIN658" />
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
