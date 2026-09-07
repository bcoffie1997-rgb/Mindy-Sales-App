import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { Users, UserCheck, Phone, Building2, Bot, Menu, X, Terminal, LockKeyhole, ListTodo } from 'lucide-react'
import { FormEvent, ReactNode, useEffect, useState } from 'react'
import Tasks from './components/Tasks'
import BDManagement from './components/BDManagement'
import ClientsRevenue from './components/ClientsRevenue'
import Leads from './components/Leads'
import MindyCC from './components/MindyCC'
import Calls from './components/Calls'
import CommandCenter from './components/CommandCenter'
import DetailView from './components/DetailView'

const navItems = [
  { to: '/', icon: ListTodo, label: 'Tasks' },
  { to: '/manage', icon: Building2, label: 'BD / Consulting' },
  { to: '/clients', icon: UserCheck, label: 'Clients / Revenue' },
  { to: '/leads', icon: Users, label: 'Leads' },
  { to: '/mindy-cc', icon: Bot, label: 'Mindy Command Center' },
  { to: '/calls', icon: Phone, label: 'Calls' },
  { to: '/command-center', icon: Terminal, label: 'Command Center' },
]

const navClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
    isActive
      ? 'border-purple-500 text-white'
      : 'border-transparent text-slate-400 hover:text-slate-200'
  }`

function AuthGate({ children }: { children: ReactNode }) {
  const [checking, setChecking] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)
  const [authRequired, setAuthRequired] = useState(true)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch('/api/session', { credentials: 'same-origin' })
      .then(async response => {
        if (!response.ok) throw new Error('Unable to check dashboard access')
        return response.json()
      })
      .then(session => {
        setAuthenticated(Boolean(session.authenticated))
        setAuthRequired(Boolean(session.authRequired))
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Unable to check dashboard access'))
      .finally(() => setChecking(false))
  }, [])

  async function signIn(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Sign in failed')
      setAuthenticated(true)
      setPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (checking) {
    return <div className="min-h-screen bg-slate-950 text-slate-500 flex items-center justify-center">Checking dashboard access…</div>
  }

  if (!authRequired || authenticated) return <>{children}</>

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <form className="card w-full max-w-sm p-7 space-y-5" onSubmit={signIn}>
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
            required
            value={password}
            onChange={event => setPassword(event.target.value)}
            className="input-dark w-full"
          />
        </div>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        <button type="submit" disabled={submitting} className="btn-primary w-full disabled:opacity-50">
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}

function DashboardApp() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        {/* Top navigation */}
        <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-md border-b border-white/10">
          <div className="flex items-center gap-4 px-4 md:px-6">
            <NavLink to="/" className="flex items-center gap-2.5 py-3 shrink-0">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
                <span className="text-white font-bold text-sm">G</span>
              </div>
              <span className="font-bold text-white text-sm hidden sm:block">GovCon Sales</span>
            </NavLink>

            {/* Desktop tabs */}
            <nav className="hidden md:flex items-center overflow-x-auto flex-1">
              {navItems.map(({ to, label }) => (
                <NavLink key={to} to={to} end={to === '/'} className={navClass}>
                  {label}
                </NavLink>
              ))}
            </nav>

            {/* Mobile hamburger */}
            <div className="md:hidden flex-1" />
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden p-2 text-slate-400 hover:text-white transition-colors"
              aria-label="Menu"
            >
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>

          {/* Mobile dropdown */}
          {menuOpen && (
            <nav className="md:hidden border-t border-white/10 bg-slate-950 px-3 py-2 space-y-0.5">
              {navItems.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      isActive ? 'bg-purple-600 text-white' : 'text-slate-300 hover:bg-white/5'
                    }`
                  }
                >
                  <Icon size={18} />
                  {label}
                </NavLink>
              ))}
            </nav>
          )}
        </header>

        {/* Main content */}
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Tasks />} />
            <Route path="/manage" element={<BDManagement />} />
            <Route path="/manage/:id" element={<DetailView mode="management" />} />
            <Route path="/clients" element={<ClientsRevenue />} />
            <Route path="/clients/:id" element={<DetailView mode="client" />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/leads/:id" element={<DetailView mode="lead" />} />
            <Route path="/mindy-cc" element={<MindyCC />} />
            <Route path="/calls" element={<Calls />} />
            <Route path="/command-center" element={<CommandCenter />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default function App() {
  return <AuthGate><DashboardApp /></AuthGate>
}
