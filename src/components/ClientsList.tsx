import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface Client {
  id: string; name: string; email: string; phone: string; company: string
  client_tier: string; client_product: string; client_amount: string
  client_start_date: string; client_status: string
  metadata?: { plan?: string; consultant?: string; managed?: boolean }
  calendly?: { total_calls: number }
}

const PLAN_ORDER = ['Beginner\'s Plan', 'Pro Member Group', 'Mindy Pro', 'Mindy Teams', 'Mindy Annual', 'Mindy Teams Lifetime', 'Consulting Accelerator']

const STATUS_COLORS: Record<string, string> = {
  active: 'badge-green',
  canceled: 'badge-red',
  refunded: 'badge-amber',
}

const TIER_COLORS: Record<string, string> = {
  mindy: 'badge-blue',
  consulting: 'badge-purple',
  white_glove: 'badge-amber',
  tier2_consulting: 'badge-purple',
  tier3_white_glove: 'badge-amber',
  unknown: 'badge-slate',
}

const TIER_LABELS: Record<string, string> = {
  mindy: 'Mindy',
  consulting: 'Consulting',
  white_glove: 'White Glove',
  tier2_consulting: 'Consulting',
  tier3_white_glove: 'White Glove',
  unknown: 'Unassigned',
}

function planLabel(client: Client) {
  return client.metadata?.plan || client.client_product || 'Unclassified'
}

function fmtDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ClientsList() {
  const navigate = useNavigate()
  const [clients, setClients] = useState<Client[]>([])
  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState('all')
  const [consultantFilter, setConsultantFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sort, setSort] = useState('recent')
  const [toggling, setToggling] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/clients').then(r => r.json()).then(setClients).catch(() => {})
  }, [])

  const plans = [...new Set(clients.map(planLabel))].sort((a, b) => {
    const ai = PLAN_ORDER.indexOf(a), bi = PLAN_ORDER.indexOf(b)
    return (ai !== -1 || bi !== -1) ? (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) : a.localeCompare(b)
  })
  const consultants = [...new Set(clients.map(c => c.metadata?.consultant).filter(Boolean))].sort() as string[]
  const amt = (c: Client) => Number(String(c.client_amount).replace(/[^0-9.]/g, '')) || 0

  const filtered = clients
    .filter(c => {
      if (planFilter !== 'all' && planLabel(c) !== planFilter) return false
      if (consultantFilter !== 'all' && (c.metadata?.consultant || '') !== consultantFilter) return false
      if (statusFilter !== 'all' && (c.client_status || 'active') !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q)
      }
      return true
    })
    .sort((a, b) =>
      sort === 'amount_desc' ? amt(b) - amt(a) :
      sort === 'amount_asc' ? amt(a) - amt(b) :
      sort === 'name' ? (a.name || '').localeCompare(b.name || '') :
      +new Date(b.client_start_date || 0) - +new Date(a.client_start_date || 0)
    )

  const activeCount = clients.filter(c => (c.client_status || 'active') === 'active').length

  async function toggleManaged(client: Client, e: React.MouseEvent) {
    e.stopPropagation()
    setToggling(client.id)
    const managed = !client.metadata?.managed
    const meta = { ...client.metadata, managed }
    setClients(prev => prev.map(c => c.id === client.id ? { ...c, metadata: meta } : c))
    await fetch(`/api/leads/${encodeURIComponent(client.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metadata: meta }),
    }).catch(() => {})
    setToggling(null)
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-bold text-white">Clients</h2>
        <span className="text-sm text-slate-500">{clients.length} total · {activeCount} active</span>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] sm:max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search name, email, or company..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-dark w-full pl-9 pr-3"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <select value={planFilter} onChange={e => setPlanFilter(e.target.value)} className="input-dark text-sm">
            <option value="all" className="bg-slate-900">All Plans</option>
            {plans.map(p => <option key={p} value={p} className="bg-slate-900">{p}</option>)}
          </select>
          {consultants.length > 0 && (
            <select value={consultantFilter} onChange={e => setConsultantFilter(e.target.value)} className="input-dark text-sm">
              <option value="all" className="bg-slate-900">All Consultants</option>
              {consultants.map(c => <option key={c} value={c} className="bg-slate-900">{c}</option>)}
            </select>
          )}
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-dark text-sm">
            <option value="all" className="bg-slate-900">All Statuses</option>
            <option value="active" className="bg-slate-900">Active</option>
            <option value="canceled" className="bg-slate-900">Canceled</option>
            <option value="refunded" className="bg-slate-900">Refunded</option>
          </select>
          <select value={sort} onChange={e => setSort(e.target.value)} className="input-dark text-sm">
            <option value="recent" className="bg-slate-900">Most Recent</option>
            <option value="amount_desc" className="bg-slate-900">Amount ↓</option>
            <option value="amount_asc" className="bg-slate-900">Amount ↑</option>
            <option value="name" className="bg-slate-900">Name A–Z</option>
          </select>
        </div>
        <span className="text-sm text-slate-500">{filtered.length} shown</span>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {filtered.length === 0 ? (
          <div className="card p-8 text-center text-slate-500">No clients found</div>
        ) : (
          filtered.map(client => (
            <div
              key={client.id}
              onClick={() => navigate(`/clients/${encodeURIComponent(client.id)}`)}
              className="card p-4 space-y-2 cursor-pointer hover:bg-white/[0.04] transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-100 truncate">{client.name}</p>
                  <p className="text-xs text-slate-500 truncate">{client.company || client.email || '—'}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${TIER_COLORS[client.client_tier] || 'badge-slate'}`}>
                    {TIER_LABELS[client.client_tier] || client.client_tier || '—'}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[client.client_status] || 'bg-white/10 text-slate-400'}`}>
                    {client.client_status || 'active'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                {client.client_amount && <span className="font-semibold text-emerald-400">{client.client_amount}</span>}
                {client.client_start_date && <span className="text-slate-500">Since {fmtDate(client.client_start_date)}</span>}
                <span className="text-slate-500">{planLabel(client)}</span>
              </div>
              <div className="flex items-center justify-between">
                <button
                  onClick={e => toggleManaged(client, e)}
                  disabled={toggling === client.id}
                  className={`text-xs px-3 py-1 rounded-lg border transition-all ${
                    client.metadata?.managed
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : 'bg-white/5 text-slate-400 border-white/10'
                  }`}
                >
                  {toggling === client.id ? '…' : client.metadata?.managed ? 'In BD Management' : 'Send to BD'}
                </button>
                {client.metadata?.consultant && (
                  <span className="text-xs text-slate-500">{client.metadata.consultant}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              {['Client', 'Plan', 'Consultant', 'Amount', 'Status', 'Since', 'BD'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">No clients found</td></tr>
            ) : (
              filtered.map(client => (
                <tr
                  key={client.id}
                  onClick={() => navigate(`/clients/${encodeURIComponent(client.id)}`)}
                  className="hover:bg-white/[0.03] transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-200">{client.name}</div>
                    <div className="text-xs text-slate-500">{client.email}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400 max-w-[160px] truncate">{planLabel(client)}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{client.metadata?.consultant || '—'}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-emerald-400">{client.client_amount || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[client.client_status] || 'bg-white/10 text-slate-400'}`}>
                      {client.client_status || 'active'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{fmtDate(client.client_start_date)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={e => toggleManaged(client, e)}
                      disabled={toggling === client.id}
                      className={`text-xs px-2 py-1 rounded-lg border transition-all ${
                        client.metadata?.managed
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          : 'bg-white/5 text-slate-400 border-white/10 hover:border-purple-500/40 hover:text-purple-300'
                      }`}
                    >
                      {toggling === client.id ? '…' : client.metadata?.managed ? '✓ BD' : 'Send'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
