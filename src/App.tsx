import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, UserCheck, Phone, Mic, Building2, Target, Bot, Menu, X, Terminal } from 'lucide-react'
import { useState } from 'react'
import Dashboard from './components/Dashboard'
import BDManagement from './components/BDManagement'
import ClientsRevenue from './components/ClientsRevenue'
import Leads from './components/Leads'
import Enterprise from './components/Enterprise'
import MindyCC from './components/MindyCC'
import Calls from './components/Calls'
import Fireflies from './components/Fireflies'
import CommandCenter from './components/CommandCenter'
import DetailView from './components/DetailView'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/manage', icon: Building2, label: 'BD / Consulting' },
  { to: '/clients', icon: UserCheck, label: 'Clients / Revenue' },
  { to: '/leads', icon: Users, label: 'Leads' },
  { to: '/enterprise', icon: Target, label: 'Enterprise Leads' },
  { to: '/mindy-cc', icon: Bot, label: 'Mindy Command Center' },
  { to: '/calls', icon: Phone, label: 'Scheduled Calls' },
  { to: '/fireflies', icon: Mic, label: 'Fireflies Notes' },
]

const bottomNavItems = navItems.slice(0, 5)
const drawerNavItems = navItems.slice(5)

const navClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
    isActive
      ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
      : 'text-slate-400 hover:bg-white/5 hover:text-white'
  }`

export default function App() {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <BrowserRouter>
      <div className="flex h-screen bg-slate-950 text-slate-100">
        {/* Sidebar — desktop only */}
        <aside className="hidden md:flex w-64 flex-col border-r border-white/10 bg-slate-950">
          <div className="p-6 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
                <span className="text-white font-bold text-lg">G</span>
              </div>
              <div>
                <h1 className="text-base font-bold text-white">GovCon Sales</h1>
                <p className="text-slate-400 text-xs">Sales Dashboard</p>
              </div>
            </div>
          </div>
          <nav className="flex-1 p-3 space-y-1">
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink key={to} to={to} end={to === '/'} className={navClass}>
                <Icon size={18} />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="p-3 border-t border-white/10">
            <NavLink to="/command-center" className={navClass}>
              <Terminal size={18} />
              Command Center
            </NavLink>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto bg-slate-950 pb-[72px] md:pb-0">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/manage" element={<BDManagement />} />
            <Route path="/manage/:id" element={<DetailView mode="management" />} />
            <Route path="/clients" element={<ClientsRevenue />} />
            <Route path="/clients/:id" element={<DetailView mode="client" />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/leads/:id" element={<DetailView mode="lead" />} />
            <Route path="/enterprise" element={<Enterprise />} />
            <Route path="/mindy-cc" element={<MindyCC />} />
            <Route path="/calls" element={<Calls />} />
            <Route path="/fireflies" element={<Fireflies />} />
            <Route path="/command-center" element={<CommandCenter />} />
          </Routes>
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-md border-t border-white/10 flex items-stretch">
          {bottomNavItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
                  isActive ? 'text-purple-400' : 'text-slate-500'
                }`
              }
            >
              <Icon size={20} />
              <span className="truncate w-full text-center px-0.5">{label.split(' ')[0]}</span>
            </NavLink>
          ))}
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium text-slate-500"
          >
            <Menu size={20} />
            <span>More</span>
          </button>
        </nav>

        {/* Mobile drawer */}
        {drawerOpen && (
          <>
            <div className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-900 border-t border-white/10 rounded-t-2xl">
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
                    <span className="text-white font-bold text-sm">G</span>
                  </div>
                  <span className="font-semibold text-white text-sm">GovCon Sales</span>
                </div>
                <button onClick={() => setDrawerOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="p-3 space-y-1">
                {drawerNavItems.map(({ to, icon: Icon, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setDrawerOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                        isActive ? 'bg-purple-600 text-white' : 'text-slate-300 hover:bg-white/5'
                      }`
                    }
                  >
                    <Icon size={18} />
                    {label}
                  </NavLink>
                ))}
                <NavLink
                  to="/command-center"
                  onClick={() => setDrawerOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                      isActive ? 'bg-purple-600 text-white' : 'text-slate-400 hover:bg-white/5'
                    }`
                  }
                >
                  <Terminal size={18} />
                  Command Center
                </NavLink>
              </div>
            </div>
          </>
        )}
      </div>
    </BrowserRouter>
  )
}
