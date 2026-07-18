import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Navbar() {
  const { profile, isAdmin, signOut } = useAuth()
  const location = useLocation()

  const isActive = (path) => location.pathname === path

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <span className="brand-mark">◆</span>
        <span>Survey Dashboard</span>
      </div>
      <div className="navbar-links">
        <Link className={isActive('/') ? 'active' : ''} to="/">Dashboard</Link>
        <Link className={isActive('/upload') ? 'active' : ''} to="/upload">Punch In Data</Link>
        {isAdmin && (
          <Link className={isActive('/projects') ? 'active' : ''} to="/projects">Manage Projects</Link>
        )}
        {isAdmin && (
          <Link className={isActive('/team') ? 'active' : ''} to="/team">Team</Link>
        )}
      </div>
      <div className="navbar-user">
        <div className="user-badge">
          <span className="user-name">{profile?.full_name || profile?.email}</span>
          <span className="user-role">{profile?.role}</span>
        </div>
        <button className="btn-ghost" onClick={signOut}>Sign out</button>
      </div>
    </nav>
  )
}
