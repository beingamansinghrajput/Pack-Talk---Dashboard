import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import Reveal from '../components/Reveal'

const EMPTY = { project_id: '', project_name: '', target: '', loi: '', ir: '', country: '', launch_date: '' }

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
            <input type="number" value={form.ir} onChange={(e) => setForm({ ...form, ir:
