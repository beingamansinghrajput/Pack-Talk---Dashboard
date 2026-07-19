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

    // Duplicate check: same UID already logged for this project
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

      // Remove duplicate UIDs within the same file upload
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
