import { useEffect, useState } from 'react'
import { RefreshCw, Inbox, UserPlus, Mail, Phone, FileText, AlertTriangle, CheckCircle } from 'lucide-react'

interface AgentEvent {
  ts: string
  from: string
  to: string
  type: string
  lead_id?: string
  payload?: any
}

const AGENT_COLORS: Record<string, string> = {
  'gc-lead-intake': 'bg-blue-500/20 text-blue-300',
  'gc-email-responder': 'bg-purple-500/20 text-purple-300',
  'gc-appointment-setter': 'bg-emerald-500/20 text-emerald-300',
  'gc-post-call': 'bg-amber-500/20 text-amber-300',
  'gc-crm-morning': 'bg-cyan-500/20 text-cyan-300',
  'gc-crm-evening': 'bg-indigo-500/20 text-indigo-300',
  'gc-qa-health': 'bg-rose-500/20 text-rose-300',
}

const EVENT_ICONS: Record<string, any> = {
  new_lead: UserPlus,
  run_summary: CheckCircle,
  hot_lead: AlertTriangle,
  wants_meeting: Phone,
  booking_confirmed: Phone,
  call_completed: Phone,
  no_show: AlertTriangle,
  schedule_follow_up: Mail,
}

function eventDescription(event: AgentEvent): string {
  const p = event.payload || {}
  switch (event.type) {
    case 'new_lead':
      return `New ${p.score || ''} lead: ${p.name || 'Unknown'} from ${p.company || 'Unknown'}`
    case 'run_summary':
      const parts: string[] = []
      if (p.new_leads !== undefined) parts.push(`${p.new_leads} new leads`)
      if (p.hot !== undefined) parts.push(`${p.hot} HOT`)
      if (p.drafts_created !== undefined) parts.push(`${p.drafts_created} drafts`)
      if (p.replies_processed !== undefined) parts.push(`${p.replies_processed} replies`)
      if (p.follow_ups_drafted !== undefined) parts.push(`${p.follow_ups_drafted} follow-ups`)
      if (p.bookings_confirmed !== undefined) parts.push(`${p.bookings_confirmed} bookings`)
      if (p.calls_processed !== undefined) parts.push(`${p.calls_processed} calls processed`)
      if (p.proposals_generated !== undefined) parts.push(`${p.proposals_generated} proposals`)
      if (p.briefing_generated) parts.push('briefing generated')
      if (p.reconciliation_complete) parts.push('reconciliation done')
      if (p.status) parts.push(`status: ${p.status}`)
      return parts.length > 0 ? parts.join(', ') : 'Completed run'
    case 'wants_meeting':
      return `${p.name || 'Lead'} wants to schedule a meeting`
    case 'booking_confirmed':
      return `Meeting booked for ${p.call_date ? new Date(p.call_date).toLocaleDateString() : 'TBD'}`
    case 'call_completed':
      return `Call completed — transcript ${p.transcript_id ? 'available' : 'pending'}`
    case 'no_show':
      return `No-show detected — re-engagement triggered`
    case 'schedule_follow_up':
      return `Follow-up scheduled for ${p.follow_up_date || 'soon'}`
    default:
      return event.type.replace(/_/g, ' ')
  }
}

export default function ActivityFeed() {
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [hours, setHours] = useState(24)
  const [loading, setLoading] = useState(false)

  const load = () => {
    setLoading(true)
    fetch(`/api/events?hours=${hours}`)
      .then(r => r.json())
      .then(data => { setEvents(data.reverse()); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [hours])

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-bold text-white">Agent Activity</h2>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <select value={hours} onChange={e => setHours(Number(e.target.value))} className="input-dark flex-1 sm:flex-none">
            <option value={4} className="bg-slate-900">Last 4 hours</option>
            <option value={12} className="bg-slate-900">Last 12 hours</option>
            <option value={24} className="bg-slate-900">Last 24 hours</option>
            <option value={48} className="bg-slate-900">Last 48 hours</option>
            <option value={168} className="bg-slate-900">Last 7 days</option>
          </select>
          <button onClick={load} className="btn-ghost border border-white/10">
            <RefreshCw size={16} className={loading ? 'animate-spin text-purple-400' : 'text-slate-400'} />
          </button>
        </div>
      </div>

      <div className="card">
        {events.length === 0 ? (
          <div className="p-12 text-center">
            <Inbox size={40} className="mx-auto text-slate-600 mb-3" />
            <p className="text-slate-400">No agent activity in the last {hours} hours</p>
            <p className="text-xs text-slate-500 mt-1">Events will appear here once agents start running</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {events.map((event, i) => {
              const Icon = EVENT_ICONS[event.type] || CheckCircle
              const agentColor = AGENT_COLORS[event.from] || 'bg-white/10 text-slate-400'
              return (
                <div key={i} className="flex items-start gap-3 px-5 py-3 hover:bg-white/[0.03] transition-colors">
                  <div className={`p-1.5 rounded-lg mt-0.5 ${agentColor}`}>
                    <Icon size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${agentColor}`}>
                        {event.from.replace('gc-', '')}
                      </span>
                      {event.lead_id && (
                        <span className="text-xs text-slate-500 font-mono">{event.lead_id}</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-300 mt-1">{eventDescription(event)}</p>
                  </div>
                  <span className="text-xs text-slate-500 whitespace-nowrap flex-shrink-0">
                    {new Date(event.ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
