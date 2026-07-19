import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import Reveal from '../components/Reveal'

export default function Team() {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').order('created_at')
    setMembers(data || [])
    setLoading(false)
  }

  async function changeRole(id, role) {
    await supabase.from('profiles').update({ role }).eq('id', id)
    load()
  }

  return (
    <div className="page">
      <h1>Team</h1>
      <p className="page-sub">
        Everyone who has logged in at least once appears here automatically. To add a new TL,
        create their login in Supabase → Authentication → Users → Add User; they'll show up
        here the first time they sign in.
      </p>

      <Reveal>
      <div className="card">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th></tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={4} className="empty-row">Loading…</td></tr>}
              {!loading && members.map((m) => (
                <tr key={m.id}>
                  <td>{m.full_name || '—'}</td>
                  <td>{m.email}</td>
                  <td>
                    <select value={m.role} onChange={(e) => changeRole(m.id, e.target.value)}>
                      <option value="tl">TL</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td>{new Date(m.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </Reveal>
    </div>
  )
}
