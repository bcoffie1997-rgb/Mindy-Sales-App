import { useEffect, useState } from 'react'
import { Phone, Clock, Building, MessageSquare, Star, UserCheck, ExternalLink, Calendar, ChevronDown, ChevronRight } from 'lucide-react'
import { apiJSON, errorMessage } from '../lib/api'
import Fireflies from './Fireflies'

interface CallEvent {
  event_id: string
  title: string
  start: string
  end: string
  location: string
  status: string
  attendees: { email: string; name: string; response: string }[]
  lead_match: {
    id: string; name: string; company: string; score: string; type: string
    client_tier?: string; status: string; phone: string; notes: string
    problem: string; industry: string; revenue: string; total_calls: number
    source: string; recommended_angle: string
  } | null
}

interface CallsData {
  generated_at: string | null
  upcoming: CallEvent[]
  past: CallEvent[]
}

function normalizeCalls(data: any): CallsData {
  const generated_at = data?.generated_at || null
  if (Array.isArray(data?.upcoming) && Array.isArray(data?.past)) {
    return { generated_at, upcoming: data.upcoming, past: data.past }
  }
  const unique = new Map<string, CallEvent>()
  for (const call of [...(data?.today || []), ...(data?.tomorrow || []), ...(data?.this_week || [])]) {
    if (call?.event_id) unique.set(call.event_id, call)
  }
  const now = Date.now()
  // The cache merges three separate day buckets, so sort by start time — the day
  // headings and the calls inside them are rendered in array order.
  const all = [...unique.values()].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  )
  return {
    generated_at,
    upcoming: all.filter(call => new Date(call.end || call.start).getTime() >= now),
    // Most recent first: for past calls the useful end of the list is the newest.
    past: all.filter(call => new Date(call.end || call.start).getTime() < now).reverse(),
  }
}

const SCORE_COLORS: Record<string, string> = {
  HOT: 'bg-red-500/20 text-red-300',
  WARM: 'bg-amber-500/20 text-amber-300',
  BASIC: 'bg-white/10 text-slate-400',
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' })
}

function groupByDay(calls: CallEvent[]) {
  const groups: Record<string, CallEvent[]> = {}
  for (const c of calls) {
    const day = formatDate(c.start)
    if (!groups[day]) groups[day] = []
    groups[day].push(c)
  }
  return groups
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

  return (
    <div
      className={`rounded-xl border transition-all cursor-pointer ${
        isLive ? 'border-emerald-500/50 bg-emerald-500/5 ring-1 ring-emerald-500/30' :
        isPast ? 'border-white/5 bg-white/[0.02] opacity-70' : 'card hover:bg-white/[0.05]'
      }`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div className={`p-2 rounded-xl flex-shrink-0 ${isLive ? 'bg-emerald-500/20 text-emerald-300' : isPast ? 'bg-slate-800 text-slate-500' : 'bg-purple-500/20 text-purple-300'}`}>
          <Phone size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-100 text-sm">{lead?.name || call.attendees[0]?.name || 'Unknown'}</span>
            {lead && <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${SCORE_COLORS[lead.score] || 'bg-white/10 text-slate-400'}`}>{lead.score}</span>}
            {isClient && <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center gap-0.5"><UserCheck size={10} /> CLIENT</span>}
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5 flex-wrap">
            {lead?.company && <span className="flex items-center gap-1"><Building size={11} />{lead.company}</span>}
            <span className="flex items-center gap-1"><Clock size={11} />{formatTime(call.start)}</span>
          </div>
        </div>
        <div className="flex-shrink-0 flex flex-col items-end gap-1">
          {isLive ? (
            <span className="text-xs font-bold text-emerald-300 bg-emerald-500/20 px-2 py-1 rounded-full animate-pulse">LIVE</span>
          ) : isPast ? (
            <span className="text-xs text-slate-500">Done</span>
          ) : null}
          {expanded ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-white/5 space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            {lead?.phone && <div className="bg-white/5 rounded-lg p-2 border border-white/5"><span className="text-slate-500 block">Phone</span><span className="font-medium text-slate-200">{lead.phone}</span></div>}
            {lead?.industry && <div className="bg-white/5 rounded-lg p-2 border border-white/5"><span className="text-slate-500 block">Industry</span><span className="font-medium text-slate-200">{lead.industry}</span></div>}
            {lead?.revenue && <div className="bg-white/5 rounded-lg p-2 border border-white/5"><span className="text-slate-500 block">Revenue</span><span className="font-medium text-slate-200">{lead.revenue}</span></div>}
            {lead?.source && <div className="bg-white/5 rounded-lg p-2 border border-white/5"><span className="text-slate-500 block">Source</span><span className="font-medium text-slate-200 capitalize">{lead.source}</span></div>}
          </div>
          {(lead?.problem || lead?.notes) && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1"><MessageSquare size={12} /> What They Want</h4>
              <p className="text-sm text-slate-200 bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">{lead.problem || lead.notes}</p>
            </div>
          )}
          {lead?.recommended_angle && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1"><Star size={12} /> Recommended Angle</h4>
              <p className="text-sm text-slate-200 bg-amber-500/10 rounded-lg p-3 border border-amber-500/20">{lead.recommended_angle}</p>
            </div>
          )}
          {call.location && (
            <a href={call.location} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-300 hover:text-white bg-purple-500/10 hover:bg-purple-500/20 rounded-lg px-3 py-2 transition-colors">
              <ExternalLink size={12} /> Join Meeting
            </a>
          )}
        </div>
      )}
    </div>
  )
}

function ScheduledCalls() {
  const [data, setData] = useState<CallsData>({ generated_at: null, upcoming: [], past: [] })
  const [view, setView] = useState<'upcoming' | 'past'>('upcoming')
  const [error, setError] = useState('')

  useEffect(() => {
    const load = () => apiJSON<any>('/api/calls')
      .then(result => {
        setData(normalizeCalls(result))
        setError('')
      })
      .catch(err => setError(errorMessage(err)))
    load()
    const interval = setInterval(load, 120000)
    return () => clearInterval(interval)
  }, [])

  const calls = view === 'upcoming' ? data.upcoming : data.past
  const groups = groupByDay(calls)

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-white">Scheduled Calls</h2>
          {data.upcoming.length > 0 && <span className="badge-purple">{data.upcoming.length} upcoming</span>}
        </div>
        <div className="flex items-center gap-1 bg-white/5 rounded-xl p-0.5 border border-white/10 self-start sm:self-auto">
          {(['upcoming', 'past'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${view === v ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' : 'text-slate-400 hover:text-white'}`}
            >
              {v === 'upcoming' ? 'Future' : 'Past'}
            </button>
          ))}
        </div>
      </div>
      {error && <div role="alert" className="card border-red-500/30 p-3 text-sm text-red-300">{error}</div>}

      {!error && data.generated_at && (
        <p className="text-xs text-slate-500">Last updated: {new Date(data.generated_at).toLocaleString('en-US', { timeZone: 'America/New_York' })}</p>
      )}

      {!error && (Object.keys(groups).length === 0 ? (
        <div className="card p-12 text-center">
          <Phone size={40} className="mx-auto text-slate-600 mb-3" />
          <p className="text-slate-400">{view === 'upcoming' ? 'No upcoming calls' : 'No past calls'}</p>
          <p className="text-xs text-slate-500 mt-1">Pulled live from Google Calendar</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groups).map(([day, dayCalls]) => (
            <div key={day}>
              <h3 className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
                <Calendar size={14} className="text-purple-400" /> {day}
                <span className="text-xs font-normal text-slate-500">({dayCalls.length} {dayCalls.length === 1 ? 'call' : 'calls'})</span>
              </h3>
              <div className="space-y-2">
                {dayCalls.map(call => <CallCard key={call.event_id} call={call} />)}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export default function Calls() {
  const [tab, setTab] = useState<'calls' | 'notes'>('calls')

  return (
    <div>
      <div className="flex items-center gap-1 px-4 sm:px-6 border-b border-white/10">
        <PageTab label="Scheduled Calls" active={tab === 'calls'} onClick={() => setTab('calls')} />
        <PageTab label="Fireflies Notes" active={tab === 'notes'} onClick={() => setTab('notes')} />
      </div>
      {tab === 'calls' ? <ScheduledCalls /> : <Fireflies />}
    </div>
  )
}

function PageTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
        active ? 'border-purple-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'
      }`}
    >
      {label}
    </button>
  )
}
