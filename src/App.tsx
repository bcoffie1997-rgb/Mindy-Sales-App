import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, UserCheck, Phone, Activity, FileText, DollarSign } from 'lucide-react'
import Dashboard from './components/Dashboard'
import Leads from './components/Leads'
import Clients from './components/Clients'
import TodayCalls from './components/TodayCalls'
import ActivityFeed from './components/ActivityFeed'
import Reports from './components/Reports'
import Revenue from './components/Revenue'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/calls', icon: Phone, label: 'Calls' },
  { to: '/leads', icon: Users, label: 'Leads' },
  { to: '/clients', icon: UserCheck, label: 'Clients' },
  { to: '/revenue', icon: DollarSign, label: 'Revenue' },
  { to: '/activity', icon: Activity, label: 'Activity' },
  { to: '/reports', icon: FileText, label: 'Reports' },
]

export default function App() {
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
          <div className="p-4 border-t border-white/10">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              7 Agents Active
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-auto bg-slate-950">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/calls" element={<TodayCalls />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/revenue" element={<Revenue />} />
            <Route path="/activity" element={<ActivityFeed />} />
            <Route path="/reports" element={<Reports />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
