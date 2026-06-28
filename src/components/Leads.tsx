import { useEffect, useState } from 'react'
import { Search, ChevronDown, ChevronUp, ExternalLink, RefreshCw } from 'lucide-react'

interface Lead {
  id: string
  name: string
  email: string
  phone: string
  company: string
  score: string
  source: string
  status: string
  first_contact_date: string
  last_action: string
  last_action_date: string
  follow_up_count: number
  notes: string
}

type SortKey = keyof Lead
type SortDir = 'asc' | 'desc'

const STATUS_COLORS: Record<string, string> = {
  new: 'badge-blue',
  first_touch_drafted: 'badge-blue',
  meeting_interest: 'badge-amber',
  booked: 'badge-green',
  call_completed: 'badge-green',
  proposal_sent: 'badge-purple',
  closed_won: 'badge-green',
  closed_lost: 'badge-red',
  no_show: 'badge-amber',
  unsubscribed: 'badge-slate',
  paid: 'badge-green',
}

export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [search, setSearch] = useState('')
  const [scoreFilter, setScoreFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortKey, setSortKey] = useState<SortKey>('last_action_date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [editing, setEditing] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  const load = () => fetch('/api/leads-only').then(r => r.json()).then(setLeads).catch(() => {})

  useEffect(() => { load() }, [])

  // Resumable GHL import: keep calling the endpoint, advancing pages, until done.
  async function runSync() {
    setSyncing(true)
    setSyncMsg('Starting GoHighLevel sync…')
    let page = 1
    let totalUpserted = 0
    try {
      for (let guard = 0; guard < 50; guard++) {
        const res = await fetch(`/api/sync-ghl?key=govcon-seed&page=${page}`)
        const json = await res.json()
        if (!json.ok) { setSyncMsg('Sync error: ' + (json.error || JSON.stringify(json))); break }
        totalUpserted += json.upsertedThisCall || 0
        const total = json.totalOpps ? ` of ~${json.totalOpps}` : ''
        setSyncMsg(`Imported ${totalUpserted}${total} pipeline leads…`)
        await load()
        if (json.done || !json.nextPage) { setSyncMsg(`✅ Done — ${totalUpserted} leads imported from GoHighLevel`); break }
        page = json.nextPage
      }
    } catch (e: any) {
      setSyncMsg('Sync failed: ' + (e?.message || String(e)))
    } finally {
      setSyncing(false)
    }
  }

  const filtered = leads
    .filter(l => {
      if (scoreFilter !== 'all' && l.score !== scoreFilter) return false
      if (statusFilter !== 'all' && l.status !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (l.name?.toLowerCase().includes(q) || l.email?.toLowerCase().includes(q) || l.company?.toLowerCase().includes(q))
      }
      return true
    })
    .sort((a, b) => {
      const av = a[sortKey] ?? ''
      const bv = b[sortKey] ?? ''
      const cmp = String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null
    return sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
  }

  const updateLead = async (id: string, updates: Partial<Lead>) => {
    await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    setEditing(null)
    load()
  }

  const statuses = [...new Set(leads.map(l => l.status))].sort()
  const scores = [...new Set(leads.map(l => l.score))].sort()

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Leads</h2>
        <div className="flex items-center gap-3">
          {syncMsg && <span className="text-xs text-slate-400">{syncMsg}</span>}
          <span className="text-sm text-slate-500">{filtered.length} leads</span>
          <button
            onClick={runSync}
            disabled={syncing}
            className="btn-primary flex items-center gap-2 text-sm px-4 py-2 disabled:opacity-50"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing…' : 'Sync from GoHighLevel'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search name, email, or company..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-dark w-full pl-9 pr-3"
          />
        </div>
        <select value={scoreFilter} onChange={e => setScoreFilter(e.target.value)} className="input-dark">
          <option value="all" className="bg-slate-900">All Scores</option>
          {scores.map(s => <option key={s} value={s} className="bg-slate-900">{s}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-dark">
          <option value="all" className="bg-slate-900">All Statuses</option>
          {statuses.map(s => <option key={s} value={s} className="bg-slate-900">{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              {([
                ['name', 'Name'],
                ['company', 'Company'],
                ['score', 'Score'],
                ['status', 'Status'],
                ['last_action', 'Last Action'],
                ['last_action_date', 'When'],
                ['follow_up_count', 'F/U #'],
              ] as [SortKey, string][]).map(([key, label]) => (
                <th
                  key={key}
                  onClick={() => toggleSort(key)}
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-white/5 select-none"
                >
                  <span className="flex items-center gap-1">{label} <SortIcon col={key} /></span>
                </th>
              ))}
              <th className="px-4 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-500">No leads found</td></tr>
            ) : (
              filtered.map(lead => (
                <tr key={lead.id} className="hover:bg-white/[0.03] transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-200">{lead.name}</div>
                    <div className="text-xs text-slate-500">{lead.email}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{lead.company || '—'}</td>
                  <td className="px-4 py-3">
                    {editing === lead.id ? (
                      <select
                        defaultValue={lead.score}
                        onChange={e => updateLead(lead.id, { score: e.target.value })}
                        className="input-dark text-xs"
                        autoFocus
                      >
                        <option value="HOT">HOT</option>
                        <option value="WARM">WARM</option>
                        <option value="BASIC">BASIC</option>
                      </select>
                    ) : (
                      <span
                        onClick={() => setEditing(lead.id)}
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full cursor-pointer ${
                          lead.score === 'HOT' ? 'bg-red-500/20 text-red-300' :
                          lead.score === 'WARM' ? 'bg-amber-500/20 text-amber-300' :
                          'bg-white/10 text-slate-400'
                        }`}
                      >{lead.score}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[lead.status] || 'bg-white/10 text-slate-400'}`}>
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{lead.last_action || '—'}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {lead.last_action_date ? new Date(lead.last_action_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
                  </td>
                  <td className="px-4 py-3 text-center text-slate-400">{lead.follow_up_count ?? 0}</td>
                  <td className="px-4 py-3">
                    {lead.notes && (
                      <span title={lead.notes} className="text-slate-500 cursor-help hover:text-purple-400 transition-colors">
                        <ExternalLink size={14} />
                      </span>
                    )}
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
