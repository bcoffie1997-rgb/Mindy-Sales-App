import { useEffect, useState } from 'react'
import { Target, Search, Building, Globe } from 'lucide-react'

interface PublicLead {
  org_name: string; program_name?: string; contact_name?: string
  contact_email?: string; contact_phone?: string; channel?: string
  state?: string; website?: string; notes?: string
}

interface TradeAssoc {
  name: string; focus?: string; membership?: string
  contact_email?: string; website?: string; notes?: string
}

const CHANNEL_LABELS: Record<string, string> = {
  sbir: 'SBIR/STTR', '8a': '8(a) BD', mentor: 'Mentor-Protégé',
  osdbu: 'OSDBU', ptac: 'PTAC', score: 'SCORE', sba: 'SBA',
}

function PublicSectorTab() {
  const [leads, setLeads] = useState<PublicLead[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [channel, setChannel] = useState('all')
  const [state, setState] = useState('all')
  const [contactOnly, setContactOnly] = useState(false)

  useEffect(() => {
    fetch('/public-sector-leads.json')
      .then(r => r.json())
      .then(setLeads)
      .catch(() => setLeads([]))
      .finally(() => setLoading(false))
  }, [])

  const channels = [...new Set(leads.map(l => l.channel).filter(Boolean))].sort((a, b) =>
    (CHANNEL_LABELS[a!] || a!).localeCompare(CHANNEL_LABELS[b!] || b!)
  ) as string[]
  const states = [...new Set(leads.map(l => l.state).filter(Boolean))].sort() as string[]

  const filtered = leads.filter(l => {
    if (channel !== 'all' && l.channel !== channel) return false
    if (state !== 'all' && l.state !== state) return false
    if (contactOnly && !l.contact_email && !l.contact_phone) return false
    if (search) {
      const q = search.toLowerCase()
      return l.org_name.toLowerCase().includes(q) ||
        (l.program_name || '').toLowerCase().includes(q) ||
        (l.contact_name || '').toLowerCase().includes(q)
    }
    return true
  }).slice(0, 400)

  if (loading) return <div className="card p-12 text-center text-slate-400">Loading public-sector targets…</div>

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] sm:max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search org, program, contact…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-dark w-full pl-9 pr-3"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <select value={channel} onChange={e => setChannel(e.target.value)} className="input-dark text-sm">
            <option value="all" className="bg-slate-900">All Channels</option>
            {channels.map(c => <option key={c} value={c} className="bg-slate-900">{CHANNEL_LABELS[c] || c}</option>)}
          </select>
          <select value={state} onChange={e => setState(e.target.value)} className="input-dark text-sm max-w-[120px]">
            <option value="all" className="bg-slate-900">All States</option>
            {states.map(s => <option key={s} value={s} className="bg-slate-900">{s}</option>)}
          </select>
          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer whitespace-nowrap">
            <input type="checkbox" checked={contactOnly} onChange={e => setContactOnly(e.target.checked)} className="accent-purple-500" />
            Has contact
          </label>
        </div>
        <span className="text-sm text-slate-500">{filtered.length} shown{leads.length > 400 ? ` of ${leads.length}` : ''}</span>
      </div>

      <div className="space-y-2">
        {filtered.map((l, i) => (
          <div key={i} className="card px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-slate-100 text-sm truncate">{l.org_name}</span>
                {l.channel && (
                  <span className="badge-blue text-xs flex-shrink-0">{CHANNEL_LABELS[l.channel] || l.channel}</span>
                )}
              </div>
              {l.program_name && <p className="text-xs text-slate-400 mt-0.5 truncate">{l.program_name}</p>}
            </div>
            <div className="flex items-center gap-3 flex-wrap text-xs text-slate-500">
              {l.state && <span>{l.state}</span>}
              {l.contact_name && <span className="text-slate-300">{l.contact_name}</span>}
              {l.contact_email && (
                <a href={`mailto:${l.contact_email}`} className="text-purple-400 hover:text-purple-300" onClick={e => e.stopPropagation()}>
                  {l.contact_email}
                </a>
              )}
              {l.website && (
                <a href={l.website} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-300">
                  <Globe size={12} />
                </a>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && !loading && (
          <div className="card p-12 text-center text-slate-500">No targets match your filters</div>
        )}
      </div>
    </div>
  )
}

function TradeAssocTab() {
  const [items, setItems] = useState<TradeAssoc[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/trade-associations.json')
      .then(r => r.json())
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  const filtered = items.filter(item =>
    !search ||
    item.name.toLowerCase().includes(search.toLowerCase()) ||
    (item.focus || '').toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <div className="card p-12 text-center text-slate-400">Loading trade associations…</div>

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          placeholder="Search associations…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-dark w-full pl-9 pr-3"
        />
      </div>
      {filtered.length === 0 ? (
        <div className="card p-12 text-center text-slate-500">
          {items.length === 0 ? 'No trade association data available.' : 'No results match your search.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item, i) => (
            <div key={i} className="card px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex-1 min-w-0">
                <span className="font-medium text-slate-100 text-sm">{item.name}</span>
                {item.focus && <p className="text-xs text-slate-400 mt-0.5">{item.focus}</p>}
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                {item.membership && <span>{item.membership}</span>}
                {item.contact_email && (
                  <a href={`mailto:${item.contact_email}`} className="text-purple-400 hover:text-purple-300">{item.contact_email}</a>
                )}
                {item.website && (
                  <a href={item.website} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-300"><Globe size={12} /></a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Enterprise() {
  const [tab, setTab] = useState<'public' | 'assoc'>('public')

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Target size={22} className="text-purple-400" /> Enterprise Leads
          </h2>
          <p className="text-slate-400 text-sm mt-1">Outreach target universe — public sector + trade associations</p>
        </div>
        <div className="inline-flex items-center gap-1 bg-white/5 rounded-xl p-1 border border-white/10 self-start sm:self-auto">
          <button
            onClick={() => setTab('public')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'public' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            <Building size={15} /> Public Sector
          </button>
          <button
            onClick={() => setTab('assoc')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'assoc' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            <Target size={15} /> Trade Associations
          </button>
        </div>
      </div>

      {tab === 'public' ? <PublicSectorTab /> : <TradeAssocTab />}
    </div>
  )
}
