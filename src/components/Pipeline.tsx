import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { RefreshCw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { apiJSON, errorMessage } from '../lib/api'

interface Lead {
  id: string
  name: string
  email: string
  company: string
  score: string
  status: string
  last_action: string
  last_action_date: string
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
}

const STAGES: Stage[] = [
  { key: 'new', label: 'New', status: 'new', match: ['new', 'first_touch_drafted'], dot: 'bg-blue-400', badge: 'badge-blue' },
  { key: 'interested', label: 'Interested', status: 'meeting_interest', match: ['meeting_interest'], dot: 'bg-amber-400', badge: 'badge-amber' },
  { key: 'booked', label: 'Call Booked', status: 'booked', match: ['booked'], dot: 'bg-emerald-400', badge: 'badge-green' },
  { key: 'call_done', label: 'Call Done', status: 'call_completed', match: ['call_completed'], dot: 'bg-cyan-400', badge: 'badge-blue' },
  { key: 'proposal', label: 'Proposal Sent', status: 'proposal_sent', match: ['proposal_sent'], dot: 'bg-purple-400', badge: 'badge-purple' },
  { key: 'won', label: 'Won', status: 'closed_won', match: ['closed_won', 'paid'], dot: 'bg-emerald-500', badge: 'badge-green' },
  { key: 'no_show', label: 'No Show', status: 'no_show', match: ['no_show'], dot: 'bg-amber-500', badge: 'badge-amber' },
  { key: 'lost', label: 'Lost', status: 'closed_lost', match: ['closed_lost', 'unsubscribed'], dot: 'bg-red-400', badge: 'badge-red' },
]

const SCORE_CLASSES: Record<string, string> = {
  HOT: 'bg-red-500/20 text-red-300',
  WARM: 'bg-amber-500/20 text-amber-300',
  BASIC: 'bg-white/10 text-slate-400',
}

function stageFor(status: string): Stage {
  return STAGES.find(s => s.match.includes(status)) || STAGES[0]
}

export default function Pipeline() {
  const navigate = useNavigate()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

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

  if (loading) return <div className="p-8 text-slate-500">Loading pipeline…</div>

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold text-white">Pipeline</h2>
          <p className="text-xs text-slate-500 mt-0.5">Drag a card to move a lead to the next stage</p>
        </div>
        <button onClick={load} className="btn-ghost flex items-center gap-1.5 text-sm" title="Refresh">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>
      {error && <div role="alert" className="card border-red-500/30 p-3 text-sm text-red-300">{error}</div>}

      <div className="flex gap-3 overflow-x-auto pb-3">
        {STAGES.map(stage => {
          const stageLeads = byStage.get(stage.key) || []
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
                <span className="text-xs text-slate-500">{stageLeads.length}</span>
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
                    <div className="flex items-center justify-between gap-2 pt-0.5" onClick={e => e.stopPropagation()}>
                      <span className="text-[10px] text-slate-500">
                        {lead.last_action_date ? new Date(lead.last_action_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                      </span>
                      <select
                        value={stage.key}
                        onChange={e => {
                          const next = STAGES.find(s => s.key === e.target.value)
                          if (next) moveTo(lead, next)
                        }}
                        className="input-dark text-[10px] py-0.5 px-1.5 w-auto"
                        title="Move to stage"
                      >
                        {STAGES.map(s => <option key={s.key} value={s.key} className="bg-slate-900">{s.label}</option>)}
                      </select>
                    </div>
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
