import { useEffect, useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, CheckCircle, Circle, Plus, RefreshCw, Phone, Calendar } from 'lucide-react'

interface Task { id: string; text: string; done: boolean }
interface Session { n: number; done: boolean; date: string; note: string }
interface Deliverable { id: string; text: string; done: boolean }

const TIER_CONFIG: Record<string, { label: string; color: string }> = {
  mindy: { label: 'Mindy', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  consulting: { label: 'Consulting', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  white_glove: { label: 'White Glove', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  tier2_consulting: { label: 'Consulting', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  tier3_white_glove: { label: 'White Glove', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  unknown: { label: 'Unassigned', color: 'bg-white/10 text-slate-400 border-white/10' },
}

const PRESET_DELIVERABLES = ['Access to the Mindy platform', '12 consulting sessions', 'Onboarding & intake call']

function fmtDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtAmt(n: number) {
  return '$' + (n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export default function DetailView({ mode = 'client' }: { mode?: 'client' | 'lead' | 'management' }) {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [tier, setTier] = useState('unknown')
  const [consultant, setConsultant] = useState('')
  const [currentStatus, setCurrentStatus] = useState('')
  const [nextStep, setNextStep] = useState('')
  const [notes, setNotes] = useState('')
  const [tasks, setTasks] = useState<Task[]>([])
  const [managed, setManaged] = useState(false)
  const [sessionsTotal, setSessionsTotal] = useState<number | ''>('')
  const [sessions, setSessions] = useState<Session[]>([])
  const [deliverables, setDeliverables] = useState<Deliverable[]>([])
  const [newDeliverable, setNewDeliverable] = useState('')
  const autoSaveRef = useRef(false)

  const isManagement = mode === 'management'
  const backPath = isManagement ? '/manage' : mode === 'lead' ? '/leads' : '/clients'
  const backLabel = isManagement ? 'BD / Consulting Management' : mode === 'lead' ? 'All leads' : 'All clients'

  async function load() {
    setLoading(true)
    autoSaveRef.current = false
    const result = await fetch(`/api/client?id=${encodeURIComponent(id || '')}`).then(r => r.json()).catch(() => null)
    if (result?.client) {
      const meta = result.client.metadata || {}
      const t = result.client.client_tier || 'unknown'
      setTier(t)
      setConsultant(meta.consultant || '')
      setCurrentStatus(meta.current_status || '')
      setNextStep(meta.next_step || '')
      setNotes(result.client.notes || '')
      setTasks(Array.isArray(meta.tasks) ? meta.tasks : [])
      setManaged(!!meta.managed)
      setSessionsTotal(meta.sessions_total ?? (t === 'consulting' || t === 'white_glove' ? 12 : ''))
      setSessions(Array.isArray(meta.sessions) ? meta.sessions : [])
      let delivs: Deliverable[] = Array.isArray(meta.deliverables) ? meta.deliverables : []
      if (!delivs.length && (t === 'consulting' || t === 'white_glove')) {
        delivs = PRESET_DELIVERABLES.map((text, i) => ({ id: `preset${i}`, text, done: false }))
        autoSaveRef.current = true
      }
      setDeliverables(delivs)
    }
    setData(result)
    setLoading(false)
    setDirty(autoSaveRef.current)
  }

  useEffect(() => { load() }, [id])

  useEffect(() => {
    if (!dirty || loading || !data?.client) return
    const t = setTimeout(() => save(), 900)
    return () => clearTimeout(t)
  }, [dirty, tier, consultant, currentStatus, nextStep, notes, tasks, managed, sessionsTotal, sessions, deliverables])

  async function save() {
    if (!data?.client) return
    setSaving(true)
    const meta = {
      ...data.client.metadata || {},
      consultant: consultant || null,
      current_status: currentStatus || null,
      next_step: nextStep || null,
      tasks,
      managed,
      sessions_total: sessionsTotal === '' ? null : Number(sessionsTotal),
      sessions,
      deliverables,
    }
    await fetch(`/api/leads/${encodeURIComponent(id || '')}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_tier: tier, notes, metadata: meta }),
    }).catch(() => {})
    setSaving(false)
    setDirty(false)
  }

  function markDirty() { setDirty(true) }

  function addDeliverable() {
    if (!newDeliverable.trim()) return
    setDeliverables(prev => [...prev, { id: `d${Date.now()}`, text: newDeliverable.trim(), done: false }])
    setNewDeliverable('')
    markDirty()
  }

  function toggleDeliverable(id: string) {
    setDeliverables(prev => prev.map(d => d.id === id ? { ...d, done: !d.done } : d))
    markDirty()
  }

  function removeDeliverable(id: string) {
    setDeliverables(prev => prev.filter(d => d.id !== id))
    markDirty()
  }

  function getSession(n: number): Session {
    return sessions.find(s => s.n === n) || { n, done: false, date: '', note: '' }
  }

  function updateSession(n: number, update: Partial<Session>) {
    setSessions(prev => {
      const exists = prev.some(s => s.n === n)
      return exists
        ? prev.map(s => s.n === n ? { ...s, ...update } : s)
        : [...prev, { n, done: false, date: '', note: '', ...update }]
    })
    markDirty()
  }

  if (loading) return <div className="p-8 text-slate-400">Loading…</div>
  if (!data?.client) return (
    <div className="p-8 text-slate-400">Not found. <Link to={backPath} className="text-purple-400">Back</Link></div>
  )

  const client = data.client
  const payments = data.payments || {}
  const transcripts = data.transcripts || []
  const upcomingCalls = data.calls?.upcoming || []
  const pastCalls = data.calls?.past || []
  const tierCfg = TIER_CONFIG[tier] || TIER_CONFIG.unknown
  const sessTotal = sessionsTotal === '' ? 0 : Number(sessionsTotal)
  const sessDone = sessions.filter(s => s.done).length
  const delivsDone = deliverables.filter(d => d.done).length
  const pct = deliverables.length ? Math.round(delivsDone / deliverables.length * 100) : sessTotal ? Math.round(sessDone / sessTotal * 100) : 0

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link to={backPath} className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={16} /> {backLabel}
        </Link>
        <div className="flex items-center gap-2 flex-wrap">
          {isManagement && (
            <button
              onClick={() => { setManaged(m => !m); markDirty() }}
              className={`text-sm px-3 py-2 rounded-xl font-medium transition-all border ${
                managed ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-white/5 text-slate-300 border-white/10'
              }`}
            >
              {managed ? '✓ In Management' : 'Add to Management'}
            </button>
          )}
          {saving && <span className="text-xs text-slate-500 flex items-center gap-1"><RefreshCw size={11} className="animate-spin" /> Saving…</span>}
          {!saving && !dirty && data?.client && <span className="text-xs text-emerald-500">Saved</span>}
        </div>
      </div>

      {/* Identity */}
      <div className="card p-5 flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-white">{client.name}</h1>
          <p className="text-slate-400 text-sm">{client.email}</p>
          {client.company && <p className="text-slate-500 text-sm">{client.company}</p>}
          {client.phone && <p className="text-slate-500 text-sm">{client.phone}</p>}
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <select
            value={tier}
            onChange={e => { setTier(e.target.value); markDirty() }}
            className={`text-xs font-semibold px-3 py-1.5 rounded-xl border cursor-pointer ${tierCfg.color}`}
          >
            {Object.entries(TIER_CONFIG).map(([k, v]) => (
              <option key={k} value={k} className="bg-slate-900 text-slate-200">{v.label}</option>
            ))}
          </select>
          {client.client_amount && <span className="text-lg font-bold text-emerald-400">{client.client_amount}</span>}
          {client.client_start_date && <span className="text-xs text-slate-500">Since {fmtDate(client.client_start_date)}</span>}
        </div>
      </div>

      {/* Payment summary */}
      {(payments.lifetime || payments.thisMonth || payments.lastMonth) && (
        <div className="grid grid-cols-3 gap-3">
          {[['Lifetime paid', fmtAmt(payments.lifetime)], ['This month', fmtAmt(payments.thisMonth)], ['Last month', fmtAmt(payments.lastMonth)]].map(([l, v]) => (
            <div key={l} className="card p-3">
              <p className="text-[11px] text-slate-500">{l}</p>
              <p className="text-base font-bold text-white">{v}</p>
            </div>
          ))}
        </div>
      )}

      {/* Progress */}
      {(sessTotal > 0 || deliverables.length > 0) && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-200">Engagement Progress</h3>
            <span className="text-sm font-bold text-white">{pct}%</span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-1">
            <div className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : pct > 50 ? 'bg-purple-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-slate-500">
            {sessTotal > 0 ? `${sessDone}/${sessTotal} sessions done` : `${delivsDone}/${deliverables.length} deliverables done`}
          </p>
        </div>
      )}

      {/* Engagement details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-200">Engagement Details</h3>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Consultant</label>
            <input
              value={consultant}
              onChange={e => { setConsultant(e.target.value); markDirty() }}
              className="input-dark w-full text-sm"
              placeholder="Assign consultant…"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Current Status</label>
            <input
              value={currentStatus}
              onChange={e => { setCurrentStatus(e.target.value); markDirty() }}
              className="input-dark w-full text-sm"
              placeholder="What's happening now…"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Next Step</label>
            <input
              value={nextStep}
              onChange={e => { setNextStep(e.target.value); markDirty() }}
              className="input-dark w-full text-sm"
              placeholder="What needs to happen next…"
            />
          </div>
          {(mode === 'client' || isManagement) && (
            <div>
              <label className="text-xs text-slate-500 block mb-1">Sessions Total</label>
              <input
                type="number"
                value={sessionsTotal}
                onChange={e => { setSessionsTotal(e.target.value === '' ? '' : Number(e.target.value)); markDirty() }}
                className="input-dark w-full text-sm"
                placeholder="12"
                min="0"
              />
            </div>
          )}
        </div>

        <div className="card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-200">Notes</h3>
          <textarea
            value={notes}
            onChange={e => { setNotes(e.target.value); markDirty() }}
            className="input-dark w-full text-sm resize-none"
            rows={6}
            placeholder="Client notes…"
          />
        </div>
      </div>

      {/* Deliverables */}
      {(deliverables.length > 0 || mode === 'client' || isManagement) && (
        <div className="card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-200">Deliverables</h3>
          <div className="space-y-2">
            {deliverables.map(d => (
              <div key={d.id} className="flex items-center gap-3">
                <button onClick={() => toggleDeliverable(d.id)} className="flex-shrink-0">
                  {d.done
                    ? <CheckCircle size={18} className="text-emerald-400" />
                    : <Circle size={18} className="text-slate-500" />}
                </button>
                <span className={`flex-1 text-sm ${d.done ? 'line-through text-slate-500' : 'text-slate-200'}`}>{d.text}</span>
                <button onClick={() => removeDeliverable(d.id)} className="text-slate-600 hover:text-red-400 text-xs transition-colors">✕</button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newDeliverable}
              onChange={e => setNewDeliverable(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addDeliverable()}
              className="input-dark flex-1 text-sm"
              placeholder="Add deliverable…"
            />
            <button onClick={addDeliverable} className="btn-ghost border border-white/10 px-3">
              <Plus size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Sessions tracker */}
      {sessTotal > 0 && (
        <div className="card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-200">Sessions ({sessDone}/{sessTotal})</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Array.from({ length: sessTotal }, (_, i) => i + 1).map(n => {
              const s = getSession(n)
              return (
                <div key={n} className={`p-3 rounded-xl border text-xs ${s.done ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-white/5 border-white/10'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-slate-200">Session {n}</span>
                    <button onClick={() => { updateSession(n, { done: !s.done }) }} className="text-[10px] px-2 py-0.5 rounded-full border transition-all">
                      {s.done ? <CheckCircle size={14} className="text-emerald-400" /> : <Circle size={14} className="text-slate-500" />}
                    </button>
                  </div>
                  <input
                    type="date"
                    value={s.date}
                    onChange={e => updateSession(n, { date: e.target.value })}
                    className="input-dark w-full text-xs py-1 mb-1"
                  />
                  <input
                    value={s.note}
                    onChange={e => updateSession(n, { note: e.target.value })}
                    className="input-dark w-full text-xs py-1"
                    placeholder="Notes…"
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Upcoming calls */}
      {upcomingCalls.length > 0 && (
        <div className="card p-4 space-y-2">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2"><Phone size={14} className="text-purple-400" /> Upcoming Calls</h3>
          {upcomingCalls.map((call: any, i: number) => (
            <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-white/5 last:border-0">
              <span className="text-slate-200">{call.title || 'Call'}</span>
              <span className="text-slate-500 text-xs">{new Date(call.start).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
            </div>
          ))}
        </div>
      )}

      {/* Transcripts */}
      {transcripts.length > 0 && (
        <div className="card p-4 space-y-2">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2"><Calendar size={14} className="text-purple-400" /> Call History ({transcripts.length})</h3>
          {transcripts.slice(0, 5).map((t: any) => (
            <div key={t.id} className="py-1.5 border-b border-white/5 last:border-0">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-200 truncate">{t.title || 'Untitled call'}</span>
                <span className="text-xs text-slate-500 flex-shrink-0 ml-2">{fmtDate(t.meeting_date)}</span>
              </div>
              {t.short_summary && <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{t.short_summary}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
