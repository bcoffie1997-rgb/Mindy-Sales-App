import { useEffect, useState } from 'react'
import { Building2, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { apiJSON, errorMessage } from '../lib/api'

interface Client {
  id: string; name: string; email: string; company: string
  client_tier: string; client_status: string; client_amount: number | string | null
  metadata?: {
    managed?: boolean; consultant?: string; current_status?: string
    next_step?: string; sessions_total?: number; sessions?: any[]
    deliverables?: any[]; tasks?: any[]
  }
}

// client_amount is a NUMERIC column, so it arrives as a bare number and rendered
// straight it reads as "4997" rather than a price.
function fmtAmt(v: number | string | null | undefined) {
  if (v == null || v === '') return null
  const n = Number(String(v).replace(/[^0-9.-]/g, ''))
  if (!Number.isFinite(n)) return null
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function getProgress(client: Client): { pct: number; label: string } {
  const meta = client.metadata || {}
  const sessTotal = Number(meta.sessions_total) || 0
  const sessDone = (meta.sessions || []).filter((s: any) => s.done).length
  if (sessTotal) return { pct: Math.round(sessDone / sessTotal * 100), label: `${sessDone}/${sessTotal} sessions` }
  const delivs = meta.deliverables || []
  if (delivs.length) {
    const done = delivs.filter((d: any) => d.done).length
    return { pct: Math.round(done / delivs.length * 100), label: `${done}/${delivs.length} delivered` }
  }
  return sessDone ? { pct: 0, label: `${sessDone} sessions logged` } : { pct: 0, label: 'Not started' }
}

export default function BDManagement() {
  const navigate = useNavigate()
  const [clients, setClients] = useState<Client[]>([])
  const [search, setSearch] = useState('')
  const [consultantFilter, setConsultantFilter] = useState('all')
  const [error, setError] = useState('')

  useEffect(() => {
    apiJSON<Client[]>('/api/clients')
      .then(data => {
        if (!Array.isArray(data)) throw new Error('Invalid clients response')
        setClients(data)
      })
      .catch(err => setError(errorMessage(err)))
  }, [])

  const managed = clients.filter(c => c.metadata?.managed)
  const consultants = [...new Set(managed.map(c => c.metadata?.consultant).filter(Boolean))].sort() as string[]

  const filtered = managed.filter(c => {
    if (consultantFilter !== 'all' && (c.metadata?.consultant || '') !== consultantFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q))
    }
    return true
  })

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Building2 size={22} className="text-purple-400" /> BD / Consulting Management
          </h2>
          <p className="text-slate-400 text-sm mt-1">Your high-ticket clients and how far along each engagement is</p>
        </div>
        <span className="text-sm text-slate-500">{managed.length} clients</span>
      </div>
      {error && <div role="alert" className="card border-red-500/30 p-3 text-sm text-red-300">{error}</div>}

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
        {consultants.length > 0 && (
          <select value={consultantFilter} onChange={e => setConsultantFilter(e.target.value)} className="input-dark">
            <option value="all" className="bg-slate-900">All Consultants</option>
            {consultants.map(c => <option key={c} value={c} className="bg-slate-900">{c}</option>)}
          </select>
        )}
        <span className="text-sm text-slate-500">{filtered.length} shown</span>
      </div>

      {filtered.length === 0 ? (
        <div className="card p-16 text-center">
          <p className="text-slate-400 font-medium">
            {managed.length === 0 ? 'No clients here yet' : 'No clients match these filters'}
          </p>
          {managed.length === 0 && (
            <p className="text-slate-500 text-sm mt-1">
              Go to the <span className="text-purple-400">Clients</span> tab and mark clients as managed to show them here.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(client => {
            const { pct, label } = getProgress(client)
            return (
              <div
                key={client.id}
                onClick={() => navigate(`/manage/${encodeURIComponent(client.id)}`)}
                className="card px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4 cursor-pointer hover:bg-white/[0.04] transition-colors"
              >
                <div className="min-w-0 sm:w-56 sm:flex-shrink-0">
                  <div className="font-medium text-slate-100 truncate">{client.name}</div>
                  <div className="text-xs text-slate-500 truncate">
                    {client.metadata?.consultant ? `Consultant: ${client.metadata.consultant}` : client.email}
                  </div>
                </div>

                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-slate-400">{label}</span>
                    <span className="text-xs font-semibold text-slate-300">{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : pct > 50 ? 'bg-purple-500' : 'bg-blue-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap sm:justify-end">
                  {client.metadata?.current_status && (
                    <span className="text-xs text-slate-400 truncate max-w-[200px]">{client.metadata.current_status}</span>
                  )}
                  {fmtAmt(client.client_amount) && (
                    <span className="text-xs font-semibold text-emerald-400 flex-shrink-0">{fmtAmt(client.client_amount)}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
