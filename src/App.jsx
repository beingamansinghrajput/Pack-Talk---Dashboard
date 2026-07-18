import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Navbar from './components/Navbar'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ProjectDetail from './pages/ProjectDetail'
import Upload from './pages/Upload'
import ProjectsAdmin from './pages/ProjectsAdmin'
import Team from './pages/Team'

function Shell({ children }) {
  const { session } = useAuth()
  return (
    <>
      {session && <Navbar />}
      <main className="main-content">{children}</main>
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Shell>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/projects/:projectId" element={<ProtectedRoute><ProjectDetail /></ProtectedRoute>} />
            <Route path="/upload" element={<ProtectedRoute><Upload /></ProtectedRoute>} />
            <Route path="/projects" element={<ProtectedRoute adminOnly><ProjectsAdmin /></ProtectedRoute>} />
            <Route path="/team" element={<ProtectedRoute adminOnly><Team /></ProtectedRoute>} />
          </Routes>
        </Shell>
      </BrowserRouter>
    </AuthProvider>
  )
}
