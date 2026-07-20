import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import logo from '../assets/logo.png'
export default function Navbar() {
  const { profile, isAdmin, isClient, signOut } = useAuth()
  const location = useLocation()
  const isActive = (path) => location.pathname === path

  if (isClient) {
    return (
      <nav className="navbar">
        <div className="navbar-brand">
          <img src={logo} alt="PackTalk" className="brand-logo" />
          <span>PackTalk</span>
        </div>
        <div className="navbar-links">
          <Link className={isActive('/') ? 'active' : ''} to="/">Dashboard</Link>
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

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <img src={logo} alt="PackTalk" className="brand-logo" />
        <span>PackTalk</span>
      </div>
      <div className="navbar-links">
        <Link className={isActive('/') ? 'active' : ''} to="/">Dashboard</Link>
        <Link className={isActive('/upload') ? 'active' : ''} to="/upload">Punch In Data</Link>
        <Link className={isActive('/earnings') ? 'active' : ''} to="/earnings">Earnings</Link>
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
