import { useEffect, useState } from 'react'
import { Mic, Clock, Users, ChevronDown, ChevronUp, ExternalLink, Tag, RefreshCw, Search } from 'lucide-react'

interface Attendee { displayName?: string; email?: string }
interface Transcript {
  id: string
  title: string
  meeting_date: string
  duration: number
  transcript_url: string
  participants: string[]
  overview: string
  short_summary: string
  action_items: string
  keywords: string[]
  matched_lead_id: string | null
  metadata: { attendees?: Attendee[] }
}

function dur(minutes: number) {
  if (!minutes) return null
  const h = Math.floor(minutes / 60), m = Math.round(minutes % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function fmtDate(iso: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function ActionItems({ text }: { text: string }) {
  if (!text) return null
  const items = text.split('\n').filter(Boolean)
  return (
    <ul className="space-y-1 mt-1">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-sm text-slate-300">
          <span className="text-purple-400 mt-0.5">•</span>
          <span>{item.replace(/^[-•*]\s*/, '')}</span>
        </li>
      ))}
    </ul>
  )
}

export default function Transcripts() {
  const [transcripts, setTranscripts] = useState<Transcript[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  async function load() {
    setLoading(true)
    const data = await fetch('/api/transcripts').then(r => r.json()).catch(() => [])
    setTranscripts(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  async function runSync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/sync-fireflies?key=govcon-seed')
      const json = await res.json()
      if (json.ok) await load()
      else alert('Sync error: ' + (json.error || JSON.stringify(json)))
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => { load() }, [])

  const q = search.toLowerCase()
  const filtered = transcripts.filter(t =>
    !q ||
    (t.title || '').toLowerCase().includes(q) ||
    (t.overview || '').toLowerCase().includes(q) ||
    (t.participants || []).some(p => p.toLowerCase().includes(q)) ||
    (t.keywords || []).some(k => k.toLowerCase().includes(q))
  )

  const matched = transcripts.filter(t => t.matched_lead_id).length

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Mic size={20} className="text-purple-400" /> Call Transcripts
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            {transcripts.length} calls synced from Fireflies
            {matched > 0 && <span className="ml-2 text-purple-400">· {matched} matched to leads</span>}
          </p>
        </div>
        <button
          onClick={runSync}
          disabled={syncing}
          className="btn-primary flex items-center gap-2 text-sm px-4 py-2 self-start sm:self-auto"
        >
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing…' : 'Sync from Fireflies'}
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className="input-dark w-full pl-9 pr-3 py-2 text-sm"
          placeholder="Search by title, participant, keyword…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center text-slate-400 py-12">Loading transcripts…</div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center space-y-3">
          <Mic size={32} className="mx-auto text-slate-600" />
          <p className="text-slate-400">
            {transcripts.length === 0
              ? 'No transcripts yet. Click "Sync from Fireflies" above to import your calls.'
              : 'No transcripts match your search.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(t => {
            const isOpen = expanded === t.id
            const attendees = t.metadata?.attendees || []
            const hasDetails = t.overview || t.action_items || t.keywords?.length > 0

            return (
              <div key={t.id} className="card overflow-hidden">
                {/* Row */}
                <div
                  className="flex items-start gap-4 p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
                  onClick={() => hasDetails && setExpanded(isOpen ? null : t.id)}
                >
                  {/* Date column */}
                  <div className="w-20 flex-shrink-0 text-center">
                    <div className="text-xs font-medium text-purple-400">
                      {t.meeting_date ? new Date(t.meeting_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                    </div>
                    <div className="text-xs text-slate-500">
                      {t.meeting_date ? new Date(t.meeting_date).getFullYear() : ''}
                    </div>
                  </div>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-medium text-white text-sm leading-tight">{t.title || 'Untitled call'}</h3>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {t.matched_lead_id && (
                          <span className="badge-purple text-xs">Lead matched</span>
                        )}
                        {t.transcript_url && (
                          <a
                            href={t.transcript_url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="text-slate-400 hover:text-white transition-colors"
                          >
                            <ExternalLink size={13} />
                          </a>
                        )}
                        {hasDetails && (
                          <span className="text-slate-500">{isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
                        )}
                      </div>
                    </div>

                    {/* Meta row */}
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                      {t.duration && (
                        <span className="flex items-center gap-1">
                          <Clock size={11} /> {dur(t.duration)}
                        </span>
                      )}
                      {(attendees.length > 0 || t.participants?.length > 0) && (
                        <span className="flex items-center gap-1">
                          <Users size={11} />
                          {attendees.length > 0
                            ? attendees.map(a => a.displayName || a.email).join(', ')
                            : (t.participants || []).join(', ')}
                        </span>
                      )}
                    </div>

                    {/* Short summary preview */}
                    {t.short_summary && !isOpen && (
                      <p className="text-xs text-slate-400 mt-1.5 line-clamp-2">{t.short_summary}</p>
                    )}
                  </div>
                </div>

                {/* Expanded details */}
                {isOpen && hasDetails && (
                  <div className="border-t border-white/10 p-4 space-y-4 bg-white/[0.02]">
                    {t.overview && (
                      <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Overview</p>
                        <p className="text-sm text-slate-200 leading-relaxed">{t.overview}</p>
                      </div>
                    )}
                    {t.short_summary && t.short_summary !== t.overview && (
                      <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Summary</p>
                        <p className="text-sm text-slate-300 leading-relaxed">{t.short_summary}</p>
                      </div>
                    )}
                    {t.action_items && (
                      <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Action Items</p>
                        <ActionItems text={t.action_items} />
                      </div>
                    )}
                    {t.keywords?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                          <Tag size={11} /> Keywords
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {t.keywords.map((kw, i) => (
                            <span key={i} className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-xs text-slate-300">
                              {kw}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
