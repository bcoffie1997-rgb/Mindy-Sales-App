import { useEffect, useMemo, useRef, useState, type DragEvent, type WheelEvent } from 'react'
import { RefreshCw, ChevronLeft, ChevronRight, DollarSign, TrendingUp, Download } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { apiJSON, errorMessage } from '../lib/api'

interface Lead {
  id: string
  name: string
  email: string
  company: string
  phone?: string
  source?: string
  score: string
  status: string
  last_action: string
  last_action_date: string
  created_at?: string
  metadata?: { opp_value?: number | null } | null
}

interface Stage {
  key: string
  label: string
  /** Status written to the lead when it is dropped into this stage */
  status: string
  /** Statuses that place a lead in this stage */
  match: string[]
  dot: string
  badge: string
  /** Whether leads in this stage count toward the open pipeline value */
  open: boolean
}

const STAGES: Stage[] = [
  { key: 'interested', label: 'Interested', status: 'meeting_interest', match: ['new', 'first_touch_drafted', 'meeting_interest'], dot: 'bg-amber-400', badge: 'badge-amber', open: true },
  { key: 'booked', label: 'Call Booked', status: 'booked', match: ['booked'], dot: 'bg-emerald-400', badge: 'badge-green', open: true },
  { key: 'call_done', label: 'Call Done', status: 'call_completed', match: ['call_completed'], dot: 'bg-cyan-400', badge: 'badge-blue', open: true },
  { key: 'proposal', label: 'Proposal Sent', status: 'proposal_sent', match: ['proposal_sent'], dot: 'bg-purple-400', badge: 'badge-purple', open: true },
  { key: 'no_show', label: 'No Show', status: 'no_show', match: ['no_show'], dot: 'bg-amber-500', badge: 'badge-amber', open: true },
  { key: 'won', label: 'Won', status: 'closed_won', match: ['closed_won', 'paid'], dot: 'bg-emerald-500', badge: 'badge-green', open: false },
  { key: 'lost', label: 'Lost', status: 'closed_lost', match: ['closed_lost', 'unsubscribed'], dot: 'bg-red-400', badge: 'badge-red', open: false },
]

const SCORE_CLASSES: Record<string, string> = {
  HOT: 'bg-red-500/20 text-red-300',
  WARM: 'bg-amber-500/20 text-amber-300',
  BASIC: 'bg-white/10 text-slate-400',
}

function stageFor(status: string): Stage {
  return STAGES.find(s => s.match.includes(status)) || STAGES[0]
}

function oppValue(lead: Lead): number {
  const v = lead.metadata?.opp_value
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function fmtMoney(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}k`
  return `$${Math.round(v).toLocaleString()}`
}

function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Standard products, stored as annual value so pipeline totals share one basis */
const VALUE_PRESETS = [
  { label: 'Mindy Monthly', sub: '$149/mo', value: 1788 },
  { label: 'Mindy Yearly', sub: '$1,490/yr', value: 1490 },
  { label: 'Consulting', sub: '$6,000', value: 6000 },
  { label: 'BD', sub: '$4k/mo', value: 48000 },
]

export default function Pipeline() {
  const navigate = useNavigate()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [editingValueId, setEditingValueId] = useState<string | null>(null)
  const [customValue, setCustomValue] = useState('')
  const [savingValue, setSavingValue] = useState(false)

  async function load() {
    try {
      const data = await apiJSON<Lead[]>('/api/leads-only')
      if (!Array.isArray(data)) throw new Error('Invalid leads response')
      setLeads(data)
      setError('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const byStage = useMemo(() => {
    const map = new Map<string, Lead[]>(STAGES.map(s => [s.key, []]))
    for (const lead of leads) map.get(stageFor(lead.status).key)!.push(lead)
    for (const list of map.values()) {
      list.sort((a, b) => (b.last_action_date || '').localeCompare(a.last_action_date || ''))
    }
    return map
  }, [leads])

  const stats = useMemo(() => {
    const monthPrefix = new Date().toISOString().slice(0, 7)
    let pipelineValue = 0, pipelineCount = 0, closedValue = 0, closedCount = 0
    for (const lead of leads) {
      const stage = stageFor(lead.status)
      if (stage.open) {
        pipelineCount++
        pipelineValue += oppValue(lead)
      } else if (stage.key === 'won' && (lead.last_action_date || '').startsWith(monthPrefix)) {
        closedCount++
        closedValue += oppValue(lead)
      }
    }
    return { pipelineValue, pipelineCount, closedValue, closedCount }
  }, [leads])

  async function moveTo(lead: Lead, stage: Stage) {
    if (stage.match.includes(lead.status)) return
    const previous = leads
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: stage.status } : l))
    try {
      await apiJSON(`/api/leads/${encodeURIComponent(lead.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: stage.status }),
      })
    } catch (err) {
      setLeads(previous)
      setError(errorMessage(err))
    }
  }

  async function saveValue(lead: Lead, amount: number) {
    if (!Number.isFinite(amount) || amount < 0) return
    setSavingValue(true)
    const previous = leads
    const metadata = { ...(lead.metadata || {}), opp_value: amount }
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, metadata } : l))
    try {
      await apiJSON(`/api/leads/${encodeURIComponent(lead.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata }),
      })
      setEditingValueId(null)
      setCustomValue('')
    } catch (err) {
      setLeads(previous)
      setError(errorMessage(err))
    } finally {
      setSavingValue(false)
    }
  }

  function startDrag(event: DragEvent<HTMLDivElement>, lead: Lead) {
    setDraggedId(lead.id)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', lead.id)
  }

  function drop(stage: Stage) {
    const lead = leads.find(l => l.id === draggedId)
    setDraggedId(null)
    setDropTarget(null)
    if (lead) moveTo(lead, stage)
  }

  function scrollByCols(direction: 1 | -1) {
    scrollerRef.current?.scrollBy({ left: direction * 260, behavior: 'smooth' })
  }

  function exportCSV(stageKey: string) {
    const rows = stageKey === 'all' ? leads : (byStage.get(stageKey) || [])
    if (!rows.length) return
    const header = ['Name', 'Company', 'Email', 'Phone', 'Score', 'Stage', 'Value (annual $)', 'Last Action', 'Last Action Date', 'Source', 'Created']
    const lines = [header.map(csvCell).join(',')]
    for (const lead of rows) {
      lines.push([
        lead.name, lead.company, lead.email, lead.phone, lead.score,
        stageFor(lead.status).label, oppValue(lead) || '',
        lead.last_action, lead.last_action_date, lead.source, lead.created_at,
      ].map(csvCell).join(','))
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pipeline-${stageKey}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function onWheel(event: WheelEvent<HTMLDivElement>) {
    const el = scrollerRef.current
    if (!el || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
    el.scrollLeft += event.deltaY
  }

  if (loading) return <div className="p-8 text-slate-500">Loading pipeline…</div>

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold text-white">Pipeline</h2>
          <p className="text-xs text-slate-500 mt-0.5">Drag a card to move a lead to the next stage</p>
        </div>
        <div className="flex items-center gap-1">
          <div className="relative flex items-center">
            <Download size={14} className="absolute left-2.5 text-slate-500 pointer-events-none" />
            <select
              value=""
              onChange={e => { if (e.target.value) exportCSV(e.target.value); e.target.value = '' }}
              className="input-dark text-sm pl-8 pr-2 py-1.5 cursor-pointer"
              title="Download a stage as CSV"
              aria-label="Export pipeline as CSV"
            >
              <option value="" className="bg-slate-900">Export CSV…</option>
              <option value="all" className="bg-slate-900">All leads</option>
              {STAGES.map(s => <option key={s.key} value={s.key} className="bg-slate-900">{s.label}</option>)}
            </select>
          </div>
          <button onClick={() => scrollByCols(-1)} className="btn-ghost px-2" title="Scroll left" aria-label="Scroll left">
            <ChevronLeft size={18} />
          </button>
          <button onClick={() => scrollByCols(1)} className="btn-ghost px-2" title="Scroll right" aria-label="Scroll right">
            <ChevronRight size={18} />
          </button>
          <button onClick={load} className="btn-ghost flex items-center gap-1.5 text-sm" title="Refresh">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>
      {error && <div role="alert" className="card border-red-500/30 p-3 text-sm text-red-300">{error}</div>}

      {/* Value summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center shrink-0">
            <DollarSign size={18} className="text-purple-300" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Open pipeline (annual value)</p>
            <p className="text-lg font-bold text-white">{fmtMoney(stats.pipelineValue)}</p>
            <p className="text-[10px] text-slate-500">{stats.pipelineCount} open lead{stats.pipelineCount === 1 ? '' : 's'}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <TrendingUp size={18} className="text-emerald-300" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Closed this month (annual value)</p>
            <p className="text-lg font-bold text-white">{fmtMoney(stats.closedValue)}</p>
            <p className="text-[10px] text-slate-500">{stats.closedCount} won this month</p>
          </div>
        </div>
      </div>

      <div
        ref={scrollerRef}
        onWheel={onWheel}
        className="flex gap-3 overflow-x-auto pb-3 [scrollbar-width:thin]"
      >
        {STAGES.map(stage => {
          const stageLeads = byStage.get(stage.key) || []
          const stageValue = stageLeads.reduce((sum, l) => sum + oppValue(l), 0)
          return (
            <div
              key={stage.key}
              onDragOver={event => {
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                setDropTarget(stage.key)
              }}
              onDragLeave={event => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTarget(null)
              }}
              onDrop={event => {
                event.preventDefault()
                drop(stage)
              }}
              className={`rounded-2xl bg-white/[0.03] border p-3 min-w-[240px] w-60 shrink-0 min-h-[160px] transition-colors ${
                dropTarget === stage.key ? 'border-purple-500/60 bg-purple-500/[0.08]' : 'border-white/10'
              }`}
            >
              <div className="flex items-center justify-between px-1 pb-3">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${stage.dot}`} />
                  <h3 className="text-sm font-semibold text-slate-200">{stage.label}</h3>
                </div>
                <span className="text-xs text-slate-500">
                  {stageValue > 0 && <span className="text-purple-300 mr-1.5">{fmtMoney(stageValue)}</span>}
                  {stageLeads.length}
                </span>
              </div>
              <div className="space-y-2">
                {stageLeads.map(lead => (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={event => startDrag(event, lead)}
                    onDragEnd={() => { setDraggedId(null); setDropTarget(null) }}
                    onClick={() => navigate(`/leads/${encodeURIComponent(lead.id)}`)}
                    className={`card p-3 space-y-1.5 cursor-grab active:cursor-grabbing hover:border-purple-500/40 transition-all ${
                      draggedId === lead.id ? 'opacity-40' : ''
                    }`}
                    title="Click to open, drag to move"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-white leading-snug">{lead.name}</p>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${SCORE_CLASSES[lead.score] || 'bg-white/10 text-slate-400'}`}>
                        {lead.score}
                      </span>
                    </div>
                    {lead.company && <p className="text-xs text-slate-400 truncate">{lead.company}</p>}
                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <span className="text-[10px] text-slate-500">
                        {lead.last_action_date ? new Date(lead.last_action_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                      </span>
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          setEditingValueId(editingValueId === lead.id ? null : lead.id)
                          setCustomValue('')
                        }}
                        className="text-[10px] font-medium text-purple-300 hover:text-purple-200 border border-purple-500/30 hover:border-purple-400/50 rounded-full px-2 py-0.5 transition-colors"
                        title="Set deal value"
                      >
                        {oppValue(lead) > 0 ? fmtMoney(oppValue(lead)) : '$ Set value'}
                      </button>
                    </div>
                    {editingValueId === lead.id && (
                      <div className="space-y-1.5 pt-1" onClick={e => e.stopPropagation()}>
                        <div className="grid grid-cols-2 gap-1">
                          {VALUE_PRESETS.map(p => (
                            <button
                              key={p.label}
                              disabled={savingValue}
                              onClick={() => saveValue(lead, p.value)}
                              className="rounded-lg border border-white/10 bg-white/5 hover:border-purple-500/50 px-1.5 py-1 text-left transition-colors disabled:opacity-50"
                            >
                              <span className="block text-[10px] font-medium text-slate-200">{p.label}</span>
                              <span className="block text-[9px] text-slate-500">{p.sub}</span>
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            placeholder="Custom $/yr"
                            value={customValue}
                            onChange={e => setCustomValue(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && saveValue(lead, Number(customValue))}
                            className="input-dark text-[10px] py-1 px-1.5 w-full min-w-0"
                          />
                          <button
                            disabled={savingValue || !customValue}
                            onClick={() => saveValue(lead, Number(customValue))}
                            className="btn-primary text-[10px] px-2 py-1 shrink-0 disabled:opacity-50"
                          >
                            Save
                          </button>
                        </div>
                        {oppValue(lead) > 0 && (
                          <button
                            disabled={savingValue}
                            onClick={() => saveValue(lead, 0)}
                            className="text-[9px] text-slate-500 hover:text-red-400 transition-colors"
                          >
                            Clear value
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {stageLeads.length === 0 && <p className="text-xs text-slate-600 px-1 py-2">No leads</p>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
