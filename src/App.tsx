import { FormEvent, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, UserCheck, Phone, FileText, DollarSign, Terminal, LockKeyhole, LogOut } from 'lucide-react'
import Dashboard from './components/Dashboard'
import Leads from './components/Leads'
import Clients from './components/Clients'
import TodayCalls from './components/TodayCalls'
import Reports from './components/Reports'
import Revenue from './components/Revenue'
import CommandCenter from './components/CommandCenter'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/command-center', icon: Terminal, label: 'Command Center' },
  { to: '/calls', icon: Phone, label: 'Calls' },
  { to: '/leads', icon: Users, label: 'Leads' },
  { to: '/clients', icon: UserCheck, label: 'Clients' },
  { to: '/revenue', icon: DollarSign, label: 'Revenue' },
  { to: '/reports', icon: FileText, label: 'Reports' },
]

export default function App() {
  return <AuthGate><AppShell /></AuthGate>
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch('/api/session', { credentials:'include' })
      .then(async response => {
        if (!response.ok) throw new Error('Unable to verify dashboard access')
        return response.json()
      })
      .then(data => setAuthenticated(data.authenticated === true))
      .catch(() => {
        if (import.meta.env.DEV) setAuthenticated(true)
        else setError('The dashboard authentication service is unavailable.')
      })
      .finally(() => setChecking(false))
  }, [])

  const login = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const response = await fetch('/api/login', {
        method:'POST',
        credentials:'include',
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({ password }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to sign in')
      setAuthenticated(true)
      setPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in')
    } finally {
      setSubmitting(false)
    }
  }

  if (checking) {
    return <div className="min-h-screen bg-slate-950 text-slate-400 flex items-center justify-center">Checking dashboard access...</div>
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <form onSubmit={login} className="card w-full max-w-sm p-7 space-y-5">
          <div className="w-12 h-12 rounded-xl bg-purple-500/20 text-purple-300 flex items-center justify-center">
            <LockKeyhole size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">GovCon Sales Dashboard</h1>
            <p className="text-sm text-slate-400 mt-1">Enter the dashboard password to access client data.</p>
          </div>
          <div>
            <label htmlFor="dashboard-password" className="block text-xs font-medium text-slate-300 mb-2">Password</label>
            <input
              id="dashboard-password"
              type="password"
              autoComplete="current-password"
              className="input-dark w-full"
              value={password}
              onChange={event => setPassword(event.target.value)}
              required
              autoFocus
            />
          </div>
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          <button type="submit" disabled={submitting} className="btn-primary w-full disabled:opacity-50">
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    )
  }

  return children
}

function AppShell() {
  const logout = async () => {
    await fetch('/api/logout', { method:'POST', credentials:'include' }).catch(() => undefined)
    window.location.reload()
  }

  return (
    <BrowserRouter>
      <div className="flex h-screen bg-slate-950 text-slate-100">
        {/* Sidebar */}
        <aside className="w-64 flex flex-col border-r border-white/10 bg-slate-950">
          <div className="p-6 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
                <span className="text-white font-bold text-lg">G</span>
              </div>
              <div>
                <h1 className="text-base font-bold text-white">GovCon Sales</h1>
                <p className="text-slate-400 text-xs">AI Team Dashboard</p>
              </div>
            </div>
          </div>
          <nav className="flex-1 p-3 space-y-1">
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
                      : 'text-slate-400 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                <Icon size={18} />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="p-3 border-t border-white/10">
            <button onClick={logout} className="btn-ghost w-full justify-start">
              <LogOut size={18} />
              Sign out
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-auto bg-slate-950">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/command-center" element={<CommandCenter />} />
            <Route path="/calls" element={<TodayCalls />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/revenue" element={<Revenue />} />
            <Route path="/reports" element={<Reports />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
