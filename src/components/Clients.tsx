import { useEffect, useState } from 'react'
import { Search, DollarSign, Crown, Star, ShieldCheck } from 'lucide-react'

interface Client {
  id: string
  name: string
  email: string
  phone: string
  company: string
  score: string
  source: string
  status: string
  type: string
  client_tier: string
  client_product: string
  client_amount: string
  client_start_date: string
  client_status: string
  first_contact_date: string
  last_action: string
  last_action_date: string
  notes: string
  calendly?: { event_type: string; total_calls: number; last_call_date: string }
  company_details?: { revenue: string; industry: string }
}

const TIER_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  tier1_training: { label: 'Training', color: 'badge-blue', icon: Star },
  tier2_consulting: { label: 'Consulting', color: 'badge-purple', icon: Crown },
  tier3_white_glove: { label: 'White Glove BD', color: 'badge-amber', icon: ShieldCheck },
  shop_tools: { label: 'Shop Tools', color: 'badge-green', icon: DollarSign },
  unknown: { label: 'Unknown', color: 'badge-slate', icon: DollarSign },
}

const STATUS_COLORS: Record<string, string> = {
  active: 'badge-green',
  canceled: 'badge-red',
  refunded: 'badge-amber',
}

function fmtDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([])
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState('all')

  useEffect(() => {
    fetch('/api/clients').then(r => r.json()).then(setClients).catch(() => {})
  }, [])

  const filtered = clients.filter(c => {
    if (tierFilter !== 'all' && c.client_tier !== tierFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q))
    }
    return true
  })

  const activeCount = clients.filter(c => c.client_status === 'active').length
  const canceledCount = clients.filter(c => c.client_status === 'canceled').length
  const refundedCount = clients.filter(c => c.client_status === 'refunded').length

  const tierCounts: Record<string, number> = {}
  for (const c of clients) {
    const t = c.client_tier || 'unknown'
    tierCounts[t] = (tierCounts[t] || 0) + 1
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-bold text-white">Clients</h2>
        <span className="text-sm text-slate-500">{clients.length} total clients</span>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3">
        <SummaryCard label="Active" value={activeCount} color="emerald" />
        <SummaryCard label="Canceled" value={canceledCount} color="red" />
        <SummaryCard label="Refunded" value={refundedCount} color="amber" />
        <SummaryCard label="Training" value={tierCounts.tier1_training || 0} color="blue" />
        <SummaryCard label="Consulting+" value={(tierCounts.tier2_consulting || 0) + (tierCounts.tier3_white_glove || 0)} color="purple" />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] sm:max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search name, email, or company..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-dark w-full pl-9 pr-3"
          />
        </div>
        <div className="flex items-center gap-2">
          <select value={tierFilter} onChange={e => setTierFilter(e.target.value)} className="input-dark flex-1 sm:flex-none">
            <option value="all" className="bg-slate-900">All Tiers</option>
            <option value="tier1_training" className="bg-slate-900">Tier 1 — Training</option>
            <option value="tier2_consulting" className="bg-slate-900">Tier 2 — Consulting</option>
            <option value="tier3_white_glove" className="bg-slate-900">Tier 3 — White Glove</option>
            <option value="shop_tools" className="bg-slate-900">Shop Tools</option>
          </select>
          <span className="text-sm text-slate-500 whitespace-nowrap">{filtered.length} shown</span>
        </div>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-2">
        {filtered.length === 0 ? (
          <div className="card p-8 text-center text-slate-500">No clients found</div>
        ) : (
          filtered.map(client => {
            const tier = TIER_CONFIG[client.client_tier] || TIER_CONFIG.unknown
            const TierIcon = tier.icon
            return (
              <div key={client.id} className="card p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-100 truncate">{client.name}</p>
                    <p className="text-xs text-slate-500 truncate">{client.company || client.email || '—'}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${tier.color}`}>
                    <TierIcon size={11} />
                    {tier.label}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[client.client_status] || 'bg-white/10 text-slate-400'}`}>
                    {client.client_status || 'active'}
                  </span>
                  {client.client_amount && (
                    <span className="text-xs font-semibold text-emerald-400">{client.client_amount}</span>
                  )}
                  {client.client_start_date && (
                    <span className="text-xs text-slate-500">Since {fmtDate(client.client_start_date)}</span>
                  )}
                  {client.calendly?.total_calls !== undefined && (
                    <span className="text-xs text-slate-500">{client.calendly.total_calls} calls</span>
                  )}
                </div>
                {client.client_product && (
                  <p className="text-xs text-slate-400 truncate">{client.client_product}</p>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Client</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Company</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Tier</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Product</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Amount</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Client Since</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Calls</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-500">No clients found</td></tr>
            ) : (
              filtered.map(client => {
                const tier = TIER_CONFIG[client.client_tier] || TIER_CONFIG.unknown
                const TierIcon = tier.icon
                return (
                  <tr key={client.id} className="hover:bg-white/[0.03] transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-200">{client.name}</div>
                      <div className="text-xs text-slate-500">{client.email}</div>
                      {client.phone && <div className="text-xs text-slate-500">{client.phone}</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{client.company || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${tier.color}`}>
                        <TierIcon size={12} />
                        {tier.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs max-w-[200px] truncate" title={client.client_product}>
                      {client.client_product || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-200 font-medium text-xs">{client.client_amount || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[client.client_status] || 'bg-white/10 text-slate-400'}`}>
                        {client.client_status || 'active'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {client.client_start_date
                        ? new Date(client.client_start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-400 text-xs">
                      {client.calendly?.total_calls || 0}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    red: 'bg-red-500/10 text-red-300 border-red-500/20',
    amber: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    blue: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
    purple: 'bg-purple-500/10 text-purple-300 border-purple-500/20',
  }
  return (
    <div className={`rounded-xl border p-3 ${colors[color] || 'bg-white/5 text-slate-300 border-white/10'}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium opacity-80">{label}</p>
    </div>
  )
}
