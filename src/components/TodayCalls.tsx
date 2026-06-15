import { useEffect, useState } from 'react'
import { Phone, Clock, MapPin, User, Building, MessageSquare, ChevronDown, ChevronRight, Star, UserCheck, ExternalLink, Calendar } from 'lucide-react'

interface CallEvent {
  event_id: string
  title: string
  start: string
  end: string
  location: string
  status: string
  minutes_until: number
  attendees: { email: string; name: string; response: string }[]
  lead_match: {
    id: string
    name: string
    company: string
    score: string
    type: string
    client_tier?: string
    status: string
    phone: string
    notes: string
    problem: string
    industry: string
    revenue: string
    total_calls: number
    source: string
    recommended_angle: string
  } | null
}

interface CallsData {
  generated_at: string | null
  today: CallEvent[]
  tomorrow: CallEvent[]
  this_week: CallEvent[]
}

const SCORE_COLORS: Record<string, string> = {
  HOT: 'bg-red-500/20 text-red-300',
  WARM: 'bg-amber-500/20 text-amber-300',
  BASIC: 'bg-white/10 text-slate-400',
}

const RESPONSE_COLORS: Record<string, string> = {
  accepted: 'text-emerald-400',
  tentative: 'text-amber-400',
  declined: 'text-red-400',
  needsAction: 'text-slate-500',
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' })
}

function CallCard({ call }: { call: CallEvent }) {
  const [expanded, setExpanded] = useState(false)
  const lead = call.lead_match
  const isClient = lead?.type === 'client'
  const now = new Date()
  const start = new Date(call.start)
  const end = new Date(call.end)
  const isLive = now >= start && now <= end
  const isPast = now > end
  const minsUntil = Math.round((start.getTime() - now.getTime()) / 60000)

  return (
    <div className={`rounded-xl border transition-all cursor-pointer ${isLive ? 'border-emerald-500/50 bg-emerald-500/5 ring-1 ring-emerald-500/30' : isPast ? 'border-white/5 bg-white/[0.02] opacity-60' : 'card-hover'}`} onClick={() => setExpanded(!expanded)}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className={`p-2 rounded-xl flex-shrink-0 ${isLive ? 'bg-emerald-500/20 text-emerald-300' : isPast ? 'bg-slate-800 text-slate-500' : 'bg-purple-500/20 text-purple-300'}`}>
          <Phone size={16} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-100 text-sm">{lead?.name || call.attendees[0]?.name || 'Unknown'}</span>
            {lead && (
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${SCORE_COLORS[lead.score] || 'bg-white/10 text-slate-400'}`}>
                {lead.score}
              </span>
            )}
            {isClient && (
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center gap-0.5">
                <UserCheck size={10} /> CLIENT
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
            {lead?.company && <span className="flex items-center gap-1"><Building size={11} />{lead.company}</span>}
            <span className="flex items-center gap-1"><Clock size={11} />{formatTime(call.start)}</span>
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          {isLive ? (
            <span className="text-xs font-bold text-emerald-300 bg-emerald-500/20 px-2 py-1 rounded-full animate-pulse">LIVE NOW</span>
          ) : isPast ? (
            <span className="text-xs text-slate-500">Done</span>
          ) : minsUntil <= 30 ? (
            <span className="text-xs font-bold text-amber-300 bg-amber-500/20 px-2 py-1 rounded-full">{minsUntil}m</span>
          ) : minsUntil <= 60 ? (
            <span className="text-xs font-medium text-purple-300">{minsUntil}m</span>
          ) : (
            <span className="text-xs text-slate-500">{Math.round(minsUntil / 60)}h {minsUntil % 60}m</span>
          )}
          {expanded ? <ChevronDown size={14} className="text-slate-500 mt-1" /> : <ChevronRight size={14} className="text-slate-500 mt-1" />}
        </div>
      </div>

      {/* Expanded Briefing */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-white/5 space-y-3">
          {/* Quick Info */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {lead?.phone && (
              <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                <span className="text-slate-500 block">Phone</span>
                <span className="font-medium text-slate-200">{lead.phone}</span>
              </div>
            )}
            {lead?.industry && (
              <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                <span className="text-slate-500 block">Industry</span>
                <span className="font-medium text-slate-200">{lead.industry}</span>
              </div>
            )}
            {lead?.revenue && (
              <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                <span className="text-slate-500 block">Revenue</span>
                <span className="font-medium text-slate-200">{lead.revenue}</span>
              </div>
            )}
            {lead?.source && (
              <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                <span className="text-slate-500 block">Source</span>
                <span className="font-medium text-slate-200 capitalize">{lead.source}</span>
              </div>
            )}
            {lead?.total_calls !== undefined && (
              <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                <span className="text-slate-500 block">Previous Calls</span>
                <span className="font-medium text-slate-200">{lead.total_calls}</span>
              </div>
            )}
          </div>

          {/* What They Want */}
          {(lead?.problem || lead?.notes) && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                <MessageSquare size={12} /> What They Want
              </h4>
              <p className="text-sm text-slate-200 bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">{lead.problem || lead.notes}</p>
            </div>
          )}

          {/* Recommended Angle */}
          {lead?.recommended_angle && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Star size={12} /> Recommended Angle
              </h4>
              <p className="text-sm text-slate-200 bg-amber-500/10 rounded-lg p-3 border border-amber-500/20">{lead.recommended_angle}</p>
            </div>
          )}

          {/* Meeting Link */}
          {call.location && (
            <a href={call.location} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-300 hover:text-white bg-purple-500/10 hover:bg-purple-500/20 rounded-lg px-3 py-2 transition-colors">
              <ExternalLink size={12} /> Join Meeting
            </a>
          )}

          {/* Attendees */}
          {call.attendees.length > 0 && (
            <div className="text-xs text-slate-500">
              {call.attendees.map((a, i) => (
                <span key={i} className={`mr-3 ${RESPONSE_COLORS[a.response] || ''}`}>
                  {a.name || a.email} ({a.response})
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function TodayCalls() {
  const [data, setData] = useState<CallsData>({ generated_at: null, today: [], tomorrow: [], this_week: [] })
  const [view, setView] = useState<'today' | 'tomorrow' | 'week'>('today')

  useEffect(() => {
    fetch('/api/calls').then(r => r.json()).then(setData).catch(() => {})
    const interval = setInterval(() => {
      fetch('/api/calls').then(r => r.json()).then(setData).catch(() => {})
    }, 120000) // refresh every 2 min
    return () => clearInterval(interval)
  }, [])

  const calls = view === 'today' ? data.today : view === 'tomorrow' ? data.tomorrow : data.this_week
  const upcomingToday = data.today.filter(c => new Date(c.start) > new Date()).length

  // Group week calls by day
  const weekByDay: Record<string, CallEvent[]> = {}
  if (view === 'week') {
    for (const c of data.this_week) {
      const day = formatDate(c.start)
      if (!weekByDay[day]) weekByDay[day] = []
      weekByDay[day].push(c)
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-white">Calls</h2>
          {upcomingToday > 0 && (
            <span className="badge-purple">{upcomingToday} today</span>
          )}
        </div>
        <div className="flex items-center gap-1 bg-white/5 rounded-xl p-0.5 border border-white/10">
          {(['today', 'tomorrow', 'week'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${view === v ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' : 'text-slate-400 hover:text-white'}`}
            >
              {v === 'today' ? 'Today' : v === 'tomorrow' ? 'Tomorrow' : 'This Week'}
            </button>
          ))}
        </div>
      </div>

      {data.generated_at && (
        <p className="text-xs text-slate-500">Last updated: {new Date(data.generated_at).toLocaleString('en-US', { timeZone: 'America/New_York' })}</p>
      )}

      {view === 'week' ? (
        Object.keys(weekByDay).length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-4">
            {Object.entries(weekByDay).map(([day, dayCalls]) => (
              <div key={day}>
                <h3 className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
                  <Calendar size={14} className="text-purple-400" /> {day}
                  <span className="text-xs font-normal text-slate-500">({dayCalls.length} calls)</span>
                </h3>
                <div className="space-y-2">
                  {dayCalls.map(call => <CallCard key={call.event_id} call={call} />)}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        calls.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-2">
            {calls.map(call => <CallCard key={call.event_id} call={call} />)}
          </div>
        )
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="card p-12 text-center">
      <Phone size={40} className="mx-auto text-slate-600 mb-3" />
      <p className="text-slate-400">No calls scheduled</p>
      <p className="text-xs text-slate-500 mt-1">Calendar data refreshes when agents run</p>
    </div>
  )
}
