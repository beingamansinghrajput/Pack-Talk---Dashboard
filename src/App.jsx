import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Navbar from './components/Navbar'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ProjectDetail from './pages/ProjectDetail'
import ProjectsAdmin from './pages/ProjectsAdmin'
import Team from './pages/Team'
import Upload from './pages/Upload'
import Earnings from './pages/Earnings'
import ClientDashboard from './pages/ClientDashboard'
function ProtectedRoute({ children }) {
  const { session, loading } = useAuth()
  if (loading) return <div style={{ padding: 40, color: '#fff' }}>Loading...</div>
  if (!session) return <Navigate to="/login" replace />
  return children
}
function HomeRoute() {
  const { isClient } = useAuth()
  return isClient ? <ClientDashboard /> : <Dashboard />
}
function AppRoutes() {
  const { session, loading } = useAuth()
  if (loading) {
    return <div style={{ padding: 40, color: '#fff' }}>Loading...</div>
  }
  return (
    <BrowserRouter>
      {session && <Navbar />}
      <Routes>
        <Route
          path="/login"
          element={session ? <Navigate to="/" replace /> : <Login />}
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <HomeRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/project/:id"
          element={
            <ProtectedRoute>
              <ProjectDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/projects"
          element={
            <ProtectedRoute>
              <ProjectsAdmin />
            </ProtectedRoute>
          }
        />
        <Route
          path="/team"
          element={
            <ProtectedRoute>
              <Team />
            </ProtectedRoute>
          }
        />
        <Route
          path="/upload"
          element={
            <ProtectedRoute>
              <Upload />
            </ProtectedRoute>
          }
        />
        <Route
          path="/earnings"
          element={
            <ProtectedRoute>
              <Earnings />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
