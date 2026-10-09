import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Building2, Search, Phone, Plus, X, UserMinus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { apiJSON, errorMessage } from '../lib/api'
import { paymentStatus, paidOfLabel, balanceLabel } from '../lib/payments'
import { searchLeads, buildNewClientBody } from '../lib/pipeline'

interface Client {
  id: string; name: string; email: string; company: string
  client_tier: string; client_status: string; client_amount: string
  metadata?: {
    managed?: boolean; consultant?: string; current_status?: string
    next_step?: string; sessions_total?: number; sessions?: any[]
    deliverables?: any[]; tasks?: any[]
    call_log?: { id: string; date: string; topics: string }[]
    calls_per_month?: number | null
    amount_paid?: number | null
    balance_due?: number | null
    next_payment_due?: string | null
  }
}

function getCallStats(client: Client): { total: number; thisMonth: number; perMonth: number | null } {
  const log = Array.isArray(client.metadata?.call_log) ? client.metadata!.call_log! : []
  const monthPrefix = new Date().toISOString().slice(0, 7)
  const thisMonth = log.filter(c => (c?.date || '').startsWith(monthPrefix)).length
  const perMonth = typeof client.metadata?.calls_per_month === 'number' ? client.metadata.calls_per_month : null
  return { total: log.length, thisMonth, perMonth }
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

const PACKAGES = [
  { label: 'Consulting $6,000', amount: 6000 },
  { label: 'White Glove $12,000', amount: 12000 },
  { label: 'BD Retainer $4,000/mo', amount: 48000 },
  { label: 'Hourly / other', amount: null as number | null },
]

/** "+ Add client" — either promote an existing lead, or create one outright. */
function AddClientPanel({
  onClose, onPromote, onCreate,
}: {
  onClose: () => void
  onPromote: (id: string) => Promise<void>
  onCreate: (body: Record<string, unknown>) => Promise<void>
}) {
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [allLeads, setAllLeads] = useState<any[]>([])
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [panelError, setPanelError] = useState('')

  // Name, email, company, phone, consultant, package, sessions, money, dates
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [phone, setPhone] = useState('')
  const [consultant, setConsultant] = useState('')
  const [pkg, setPkg] = useState(PACKAGES[0].label)
  const [sessions, setSessions] = useState('12')
  const [paid, setPaid] = useState('')
  const [balance, setBalance] = useState('')
  const [due, setDue] = useState('')
  const [start, setStart] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    apiJSON<any[]>('/api/leads')
      .then(data => setAllLeads(Array.isArray(data) ? data : []))
      .catch(err => setPanelError(errorMessage(err)))
  }, [])

  const results = useMemo(() => searchLeads(allLeads, query), [allLeads, query])

  async function submitNew(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setPanelError('')
    const selected = PACKAGES.find(p => p.label === pkg) || PACKAGES[0]
    try {
      await onCreate(buildNewClientBody({
        name, email, company, phone, consultant,
        packageLabel: selected.label,
        packageAmount: selected.amount,
        sessionsTotal: sessions === '' ? null : Number(sessions),
        amountPaid: paid === '' ? null : Number(paid),
        balanceDue: balance === '' ? null : Number(balance),
        nextPaymentDue: due,
        startDate: start,
        note,
      }))
      onClose()
    } catch (err) {
      setPanelError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="card w-full max-w-lg p-5 space-y-4 my-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">Add client</h3>
          <button onClick={onClose} className="btn-ghost px-2" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="inline-flex items-center gap-1 bg-white/5 rounded-xl p-1 border border-white/10">
          {([['existing', 'Existing lead'], ['new', 'Brand new client']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                mode === key ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {panelError && <p role="alert" className="text-sm text-red-300">{panelError}</p>}

        {mode === 'existing' ? (
          <div className="space-y-2">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-3 text-slate-500 pointer-events-none" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search name, email or company…"
                className="input-dark w-full pl-9 pr-3"
                aria-label="Search leads to add to BD"
              />
            </div>
            <div className="max-h-72 overflow-y-auto space-y-1">
              {query.trim().length >= 2 && results.length === 0 && (
                <p className="text-xs text-slate-500 px-1 py-2">Nobody matches that.</p>
              )}
              {results.map(lead => (
                <div key={lead.id} className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-white/5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-100 truncate">{lead.name}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {[lead.company, lead.email].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {lead.metadata?.managed ? (
                    <span className="text-xs text-emerald-400 shrink-0">Already in BD</span>
                  ) : (
                    <button
                      disabled={busyId === lead.id}
                      onClick={async () => {
                        setBusyId(lead.id)
                        setPanelError('')
                        try { await onPromote(lead.id); onClose() }
                        catch (err) { setPanelError(errorMessage(err)) }
                        finally { setBusyId(null) }
                      }}
                      className="btn-primary text-xs px-2.5 py-1 shrink-0 disabled:opacity-50"
                    >
                      {busyId === lead.id ? '…' : 'Add'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <form onSubmit={submitNew} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="text-xs text-slate-500 block mb-1">Name *</label>
                <input autoFocus required value={name} onChange={e => setName(e.target.value)} className="input-dark w-full text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input-dark w-full text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Phone</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} className="input-dark w-full text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Company</label>
                <input value={company} onChange={e => setCompany(e.target.value)} className="input-dark w-full text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Consultant</label>
                <input value={consultant} onChange={e => setConsultant(e.target.value)} className="input-dark w-full text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Package</label>
                <select value={pkg} onChange={e => setPkg(e.target.value)} className="input-dark w-full text-sm">
                  {PACKAGES.map(p => <option key={p.label} value={p.label} className="bg-slate-900">{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Sessions total</label>
                <input type="number" min="0" value={sessions} onChange={e => setSessions(e.target.value)} className="input-dark w-full text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Amount paid ($)</label>
                <input type="number" min="0" value={paid} onChange={e => setPaid(e.target.value)} className="input-dark w-full text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Balance due ($)</label>
                <input type="number" min="0" value={balance} onChange={e => setBalance(e.target.value)} className="input-dark w-full text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Next payment due</label>
                <input type="date" value={due} onChange={e => setDue(e.target.value)} className="input-dark w-full text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Start date</label>
                <input type="date" value={start} onChange={e => setStart(e.target.value)} className="input-dark w-full text-sm" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-slate-500 block mb-1">Note</label>
                <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} className="input-dark w-full text-sm resize-none" />
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              New clients are saved as Won, so they appear in the Won column on the pipeline as well as here.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="btn-ghost text-sm">Cancel</button>
              <button type="submit" disabled={saving || !name.trim()} className="btn-primary text-sm disabled:opacity-50">
                {saving ? 'Creating…' : 'Create client'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default function BDManagement() {
  const navigate = useNavigate()
  const [clients, setClients] = useState<Client[]>([])
  const [search, setSearch] = useState('')
  const [consultantFilter, setConsultantFilter] = useState('all')
  const [error, setError] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [removing, setRemoving] = useState<Client | null>(null)
  const [removeBusy, setRemoveBusy] = useState(false)

  function load() {
    return apiJSON<Client[]>('/api/managed-clients')
      .then(data => {
        if (!Array.isArray(data)) throw new Error('Invalid clients response')
        setClients(data)
        setError('')
      })
      .catch(err => setError(errorMessage(err)))
  }

  useEffect(() => { load() }, [])

  /** Flip metadata.managed on an existing lead. Never deletes the record. */
  async function setManaged(id: string, managed: boolean, existing?: Record<string, unknown> | null) {
    const metadata = { ...(existing || {}), managed }
    await apiJSON(`/api/leads?id=${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metadata }),
    })
    await load()
  }

  async function promote(id: string) {
    // Re-read the row so the merge keeps every other metadata key intact
    const lead = await apiJSON<any>(`/api/leads?id=${encodeURIComponent(id)}`)
    await setManaged(id, true, lead?.metadata)
  }

  async function createClient(body: Record<string, unknown>) {
    await apiJSON('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    await load()
  }

  async function confirmRemove() {
    if (!removing) return
    setRemoveBusy(true)
    try {
      await setManaged(removing.id, false, removing.metadata as Record<string, unknown>)
      setRemoving(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setRemoveBusy(false)
    }
  }

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
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">{managed.length} clients</span>
          <button onClick={() => setAddOpen(true)} className="btn-primary flex items-center gap-1.5 text-sm">
            <Plus size={15} /> Add client
          </button>
        </div>
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
                  {(() => {
                    const cs = getCallStats(client)
                    if (!cs.total && cs.perMonth == null) return null
                    return (
                      <span className="text-xs text-slate-400 flex items-center gap-1 flex-shrink-0" title={`${cs.total} calls logged total`}>
                        <Phone size={11} className="text-purple-400" />
                        {cs.perMonth != null ? `${cs.thisMonth}/${cs.perMonth} calls this mo` : `${cs.total} calls`}
                      </span>
                    )
                  })()}
                  {(() => {
                    const pay = paymentStatus(client.metadata)
                    if (!pay) return null
                    return (
                      <span className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-slate-400">{paidOfLabel(pay)}</span>
                        {pay.balance > 0 && (
                          <span className="badge-red" title={balanceLabel(pay)}>
                            {balanceLabel(pay)}
                          </span>
                        )}
                      </span>
                    )
                  })()}
                  {client.metadata?.current_status && (
                    <span className="text-xs text-slate-400 truncate max-w-[200px]">{client.metadata.current_status}</span>
                  )}
                  {client.client_amount && (
                    <span className="text-xs font-semibold text-emerald-400 flex-shrink-0">{client.client_amount}</span>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); setRemoving(client) }}
                    className="text-slate-600 hover:text-red-400 transition-colors shrink-0 p-1"
                    title="Remove from BD / Consulting"
                    aria-label={`Remove ${client.name} from BD`}
                  >
                    <UserMinus size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {addOpen && (
        <AddClientPanel
          onClose={() => setAddOpen(false)}
          onPromote={promote}
          onCreate={createClient}
        />
      )}

      {removing && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="card w-full max-w-sm p-5 space-y-4">
            <h3 className="text-lg font-bold text-white">Remove from BD?</h3>
            <p className="text-sm text-slate-400">
              <span className="text-slate-100">{removing.name}</span> will come off the BD / Consulting
              roster. The record, its sessions, call log and payments are all kept — you can add them
              back any time.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setRemoving(null)} className="btn-ghost text-sm">Cancel</button>
              <button
                onClick={confirmRemove}
                disabled={removeBusy}
                className="text-sm px-3 py-2 rounded-xl font-medium bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25 transition-colors disabled:opacity-50"
              >
                {removeBusy ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
