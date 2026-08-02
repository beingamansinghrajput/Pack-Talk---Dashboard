import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import Reveal from '../components/Reveal'

function extractPrefix(uid) {
  if (!uid) return null
  const match = uid.match(/([A-Z]+\d+)$/)
  return match ? match[1] : null
}

// Client-facing status wording — only Completed is translated, others pass through as-is
const STATUS_EXPORT_LABEL = { Completed: 'success' }
function exportStatus(status) {
  return STATUS_EXPORT_LABEL[status] || status
}

// Excel sheet names: max 31 chars, no : \ / ? * [ ]
function safeSheetName(name, usedNames) {
  let cleaned = String(name || 'Sheet').replace(/[:\\/?*[\]]/g, '-').slice(0, 31)
  let final = cleaned
  let n = 2
  while (usedNames.has(final)) {
    final = `${cleaned.slice(0, 28)}~${n}`
    n++
  }
  usedNames.add(final)
  return final
}

export default function Exports() {
  const { isAdmin, isTeamLead, profile } = useAuth()
  const [members, setMembers] = useState([])
  const [stings, setStings] = useState([])
  const [projects, setProjects] = useState([])
  const [clientProjects, setClientProjects] = useState([])
  const [responses, setResponses] = useState([])
  const [loading, setLoading] = useState(true)

  const [personId, setPersonId] = useState('')
  const [clientId, setClientId] = useState('')
  const [message, setMessage] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: memberData }, { data: stingData }, { data: projectData }, { data: cpData }] = await Promise.all([
      supabase.from('profiles').select('*'),
      supabase.from('sting_prefixes').select('*'),
      supabase.from('projects').select('*'),
      supabase.from('client_projects').select('*'),
    ])
    const { data: respData } = await supabase
      .from('responses')
      .select('project_id, uid, status, start_time, end_time, duration_min, country, ip_address, gender, age')

    setMembers(memberData || [])
    setStings(stingData || [])
    setProjects(projectData || [])
    setClientProjects(cpData || [])
    setResponses(respData || [])
    setLoading(false)
  }

  const employees = useMemo(
    () => members.filter((m) => m.role === 'tl' || m.role === 'team_lead')
      .filter((m) => isAdmin || m.team_id === profile?.team_id)
      .sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email)),
    [members, isAdmin, profile]
  )
  const clients = useMemo(
    () => members.filter((m) => m.role === 'client').sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email)),
    [members]
  )

  const profileByPrefix = useMemo(() => {
    const map = new Map()
    stings.forEach((s) => map.set(s.prefix, s.profile_id))
    return map
  }, [stings])

  const clientNameForProject = (project_id) => {
    const link = clientProjects.find((cp) => cp.project_id === project_id)
    if (!link) return null
    return members.find((m) => m.id === link.client_id)?.full_name || null
  }

  const memberName = (id) => {
    const m = members.find((mm) => mm.id === id)
    return m ? (m.full_name || m.email) : 'Unattributed'
  }

  const projectName = (id) => projects.find((p) => p.project_id === id)?.project_name || id

  function rowFor(r, extra = {}) {
    return {
      'Project ID': r.project_id,
      'Project Name': projectName(r.project_id),
      Sting: r.uid,
      Status: r.status,
      'IP Address': r.ip_address || '',
      Gender: r.gender || '',
      Age: r.age ?? '',
      'Start Time': r.start_time ? new Date(r.start_time).toLocaleString() : '',
      'End Time': r.end_time ? new Date(r.end_time).toLocaleString() : '',
      'Duration (min)': r.duration_min ?? '',
      Country: r.country || '',
      ...extra,
    }
  }

  function exportPerson() {
    setMessage(null)
    if (!personId) {
      setMessage({ type: 'error', text: 'Pick a person first.' })
      return
    }
    const person = members.find((m) => m.id === personId)
    const myResponses = responses.filter((r) => profileByPrefix.get(extractPrefix(r.uid)) === personId)

    if (myResponses.length === 0) {
      setMessage({ type: 'error', text: `No responses found for ${person?.full_name || person?.email} yet.` })
      return
    }

    const byClient = {}
    myResponses.forEach((r) => {
      const client = clientNameForProject(r.project_id) || 'Unassigned'
      if (!byClient[client]) byClient[client] = []
      byClient[client].push(r)
    })

    const wb = XLSX.utils.book_new()
    const usedNames = new Set()
    Object.entries(byClient).forEach(([clientName, rows]) => {
      const sheet = XLSX.utils.json_to_sheet(rows.map((r) => rowFor(r)))
      XLSX.utils.book_append_sheet(wb, sheet, safeSheetName(clientName, usedNames))
    })

    const fileName = `${(person?.full_name || person?.email || 'employee').replace(/[^a-z0-9]/gi, '_')}_stings.xlsx`
    XLSX.writeFile(wb, fileName)
    setMessage({ type: 'success', text: `Downloaded ${fileName}` })
  }

  function exportClient() {
    setMessage(null)
    if (!clientId) {
      setMessage({ type: 'error', text: 'Pick a client first.' })
      return
    }
    const client = members.find((m) => m.id === clientId)
    const linkedProjectIds = clientProjects.filter((cp) => cp.client_id === clientId).map((cp) => cp.project_id)
    const clientResponses = responses.filter((r) => linkedProjectIds.includes(r.project_id))

    if (clientResponses.length === 0) {
      setMessage({ type: 'error', text: `No responses found for ${client?.full_name || client?.email} yet.` })
      return
    }

    const wb = XLSX.utils.book_new()
    const usedNames = new Set()

    // ---- Sheet 1: combined, grouped into blocks by PID, everyone mixed together ----
    const byProject = {}
    clientResponses.forEach((r) => {
      if (!byProject[r.project_id]) byProject[r.project_id] = []
      byProject[r.project_id].push(r)
    })

    const combinedRows = []
    Object.entries(byProject).forEach(([project_id, rows], idx) => {
      if (idx > 0) combinedRows.push([])
      combinedRows.push([`PID: ${project_id}    (Total Records: ${rows.length})`])
      combinedRows.push(['S.No', 'UID / Sting ID', 'IP Address', 'Status', 'Gender', 'Age'])
      rows.forEach((r, i) => {
        combinedRows.push([i + 1, r.uid, r.ip_address || '', exportStatus(r.status), r.gender || '', r.age ?? ''])
      })
    })

    const combinedSheet = XLSX.utils.aoa_to_sheet(combinedRows)
    XLSX.utils.book_append_sheet(wb, combinedSheet, safeSheetName('All PIDs', usedNames))

    // ---- Per-person tabs, side-by-side blocks — one block per project they worked on ----
    const byPersonProject = {}
    clientResponses.forEach((r) => {
      const pid = profileByPrefix.get(extractPrefix(r.uid)) || 'unattributed'
      if (!byPersonProject[pid]) byPersonProject[pid] = {}
      if (!byPersonProject[pid][r.project_id]) byPersonProject[pid][r.project_id] = []
      byPersonProject[pid][r.project_id].push(r)
    })

    const BLOCK_WIDTH = 7 // S.no, Sting, Project ID, Status, IP Address, Gender, Age
    const BLOCK_GAP = 1   // one blank column between side-by-side blocks

    Object.entries(byPersonProject).forEach(([pid, projectMap]) => {
      const personName = pid === 'unattributed' ? 'Unattributed' : memberName(pid)
      const projectEntries = Object.entries(projectMap)
      const maxRows = Math.max(...projectEntries.map(([, rows]) => rows.length))
      const totalRows = 2 + maxRows
      const grid = Array.from({ length: totalRows }, () => [])

      projectEntries.forEach(([projectId, rows], blockIdx) => {
        const startCol = blockIdx * (BLOCK_WIDTH + BLOCK_GAP)
        grid[0][startCol + 4] = projectId
        const headers = ['S.no', 'Sting', 'Project ID', 'Status', 'IP Address', 'Gender', 'Age']
        headers.forEach((h, i) => { grid[1][startCol + i] = h })
        rows.forEach((r, i) => {
          const rowIdx = 2 + i
          grid[rowIdx][startCol + 0] = i + 1
          grid[rowIdx][startCol + 1] = r.uid
          grid[rowIdx][startCol + 2] = projectId
          grid[rowIdx][startCol + 3] = exportStatus(r.status)
          grid[rowIdx][startCol + 4] = r.ip_address || ''
          grid[rowIdx][startCol + 5] = r.gender || ''
          grid[rowIdx][startCol + 6] = r.age ?? ''
        })
      })

      const personSheet = XLSX.utils.aoa_to_sheet(grid)
      XLSX.utils.book_append_sheet(wb, personSheet, safeSheetName(personName, usedNames))
    })

    const fileName = `${(client?.full_name || client?.email || 'client').replace(/[^a-z0-9]/gi, '_')}_report.xlsx`
    XLSX.writeFile(wb, fileName)
    setMessage({ type: 'success', text: `Downloaded ${fileName}` })
  }

  if (loading) return <div className="page-loading">Loading…</div>

  return (
    <div className="page">
      <h1>Exports</h1>
      <p className="page-sub">
        Generate Excel workbooks straight from your sting data — one tab per client for a person's file, or a combined PID sheet plus per-person tabs for a client's file.
      </p>

      {message && (
        <div className={message.type === 'error' ? 'auth-error' : 'auth-success'} style={{ marginBottom: 16 }}>
          {message.text}
        </div>
      )}

      <Reveal>
        <div className="card" style={{ maxWidth: 480 }}>
          <h2 className="card-title">Export by Person</h2>
          <p className="card-hint">
            One workbook for this person, with a separate tab per client they've collected responses for.
          </p>
          <label style={{ display: 'block', marginTop: 12 }}>Employee
            <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
              <option value="">Select…</option>
              {employees.map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
            </select>
          </label>
          <button className="btn-primary" onClick={exportPerson} style={{ marginTop: 12 }}>
            Download Person's Excel File
          </button>
        </div>
      </Reveal>

      <Reveal delay={60}>
        <div className="card" style={{ maxWidth: 480 }}>
          <h2 className="card-title">Export by Client</h2>
          <p className="card-hint">
            One workbook for this client: a combined "All PIDs" sheet with everyone's responses grouped by project, plus a separate tab per person with their projects laid out side by side.
          </p>
          <label style={{ display: 'block', marginTop: 12 }}>Client
            <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Select…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.full_name || c.email}</option>)}
            </select>
          </label>
          <button className="btn-primary" onClick={exportClient} style={{ marginTop: 12 }}>
            Download Client's Excel File
          </button>
        </div>
      </Reveal>
    </div>
  )
}
