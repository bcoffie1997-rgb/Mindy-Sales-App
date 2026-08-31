import { useEffect, useState } from 'react'
import { Terminal, Play, RotateCw, Clock, Activity, Zap, Server, CheckCircle2, XCircle, AlertCircle, Circle } from 'lucide-react'
import { apiFetch, getErrorMessage } from '../lib/api'

interface AgentStatus {
  id: string
  name: string
  cron: string
  description: string
  lastRun: string | null
  lastSummary: any
  runsLast24h: number
  status: 'idle' | 'running' | 'error' | 'offline'
}

interface CommandCenterData {
  agents: AgentStatus[]
  recentEvents: any[]
  system: {
    uptime: number
    timezone: string
    serverTime: string
    integrations: Record<string, boolean>
  }
}

function parseCommandCenter(value: unknown): CommandCenterData {
  if (!value || typeof value !== 'object') throw new Error('Command center response was invalid.')
  const data = value as Partial<CommandCenterData>
  if (!Array.isArray(data.agents) || !data.system || typeof data.system !== 'object') {
    throw new Error('Command center response is missing system data.')
  }
  const system = data.system as CommandCenterData['system']
  if (!system.integrations || typeof system.integrations !== 'object') {
    throw new Error('Command center response is missing integrations.')
  }
  const validStatuses = new Set(['idle', 'running', 'error', 'offline'])
  return {
    agents: data.agents.filter(agent => agent && typeof agent.id === 'string' && validStatuses.has(agent.status)),
    recentEvents: Array.isArray(data.recentEvents) ? data.recentEvents.filter(event => event && typeof event === 'object') : [],
    system: {
      uptime: Number(system.uptime) || 0,
      timezone: typeof system.timezone === 'string' ? system.timezone : 'Unknown',
      serverTime: typeof system.serverTime === 'string' ? system.serverTime : new Date().toISOString(),
      integrations: system.integrations,
    },
  }
}

const STATUS_STYLES: Record<string, string> = {
  idle: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  running: 'bg-blue-500/20 text-blue-300 border-blue-500/30 animate-pulse',
  error: 'bg-red-500/20 text-red-300 border-red-500/30',
  offline: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
}

const STATUS_ICONS: Record<string, any> = {
  idle: CheckCircle2,
  running: Activity,
  error: XCircle,
  offline: Circle,
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const mins = Math.floor(seconds / 60)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

function formatCron(cron: string): string {
  const map: Record<string, string> = {
    '*/30 9-18 * * 1-5': 'Every 30 min, 9 AM–7 PM (Mon–Fri)',
    '32 9-17 * * 1-5': 'Hourly at :32, 9 AM–6 PM (Mon–Fri)',
    '57 9,11,13,15,17 * * 1-5': 'At :57 past 9/11/1/3/5 (Mon–Fri)',
    '50 9-17 * * 1-5': 'Hourly at :50, 9 AM–6 PM (Mon–Fri)',
    '7 7 * * 1-5': 'Daily at 7:07 AM (Mon–Fri)',
    '23 7 * * 1-5': 'Daily at 7:23 AM (Mon–Fri)',
    '39 17 * * 1-5': 'Daily at 5:39 PM (Mon–Fri)',
  }
  return map[cron] || cron
}

export default function CommandCenter() {
  const [data, setData] = useState<CommandCenterData | null>(null)
  const [loading, setLoading] = useState(true)
  const [runningAgent, setRunningAgent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchData = async () => {
    try {
      setData(parseCommandCenter(await apiFetch<unknown>('/api/command-center')))
      setError(null)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load command center.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 15000)
    return () => clearInterval(interval)
  }, [])

  const runAgent = async (id: string, name: string) => {
    setRunningAgent(id)
    try {
      setError(null)
      await apiFetch(`/api/agents/${id}/run`, { method: 'POST' })
      await fetchData()
    } catch (err) {
      setError(getErrorMessage(err, `Failed to run ${name}.`))
      alert(`Failed to run ${name}`)
    } finally {
      setRunningAgent(null)
    }
  }

  const runAllAgents = async () => {
    setRunningAgent('all')
    try {
      setError(null)
      await apiFetch('/api/agents/run-all', { method: 'POST' })
      await fetchData()
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to run all agents.'))
      alert('Failed to run all agents')
    } finally {
      setRunningAgent(null)
    }
  }

  if (loading) return <div className="p-8 text-slate-400">Loading command center...</div>
  if (!data) return <div className="p-8 text-red-400">{error || 'Failed to load command center.'}</div>

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Terminal className="text-purple-400" size={26} />
            Command Center
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">Monitor, control, and inspect every agent</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={runAllAgents}
            disabled={runningAgent === 'all'}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {runningAgent === 'all' ? <RotateCw className="animate-spin" size={14} /> : <Zap size={14} />}
            Run All Agents
          </button>
          <button onClick={fetchData} className="btn-secondary">
            <RotateCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

      {/* System Status */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
          <Server size={16} className="text-blue-400" /> System Status
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white/5 rounded-xl p-3 border border-white/5">
            <p className="text-[11px] text-slate-500">Server Uptime</p>
            <p className="text-lg font-bold text-white">{formatDuration(data.system.uptime)}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-3 border border-white/5">
            <p className="text-[11px] text-slate-500">Timezone</p>
            <p className="text-lg font-bold text-white">{data.system.timezone}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-3 border border-white/5">
            <p className="text-[11px] text-slate-500">Server Time</p>
            <p className="text-sm font-bold text-white">{new Date(data.system.serverTime).toLocaleTimeString()}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-3 border border-white/5">
            <p className="text-[11px] text-slate-500">Active Agents</p>
            <p className="text-lg font-bold text-white">{data.agents.filter(a => a.status !== 'offline').length} / {data.agents.length}</p>
          </div>
        </div>

        <div className="mt-4">
          <p className="text-xs text-slate-500 mb-2">Integrations</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(data.system.integrations).map(([key, enabled]) => (
              <span
                key={key}
                className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
                  enabled ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                }`}
              >
                {enabled ? '✓' : '○'} {key}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Agent Grid */}
      {data.agents.length === 0 ? (
        <div className="card p-12 text-center text-slate-500">No agents are configured.</div>
      ) : <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {data.agents.map(agent => {
          const StatusIcon = STATUS_ICONS[agent.status]
          return (
            <div key={agent.id} className="card p-5 flex flex-col gap-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-xl border ${STATUS_STYLES[agent.status]}`}>
                    <StatusIcon size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">{agent.name}</h3>
                    <p className="text-xs text-slate-400">{agent.description}</p>
                  </div>
                </div>
                <button
                  onClick={() => runAgent(agent.id, agent.name)}
                  disabled={runningAgent === agent.id || runningAgent === 'all'}
                  className="p-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Run now"
                >
                  {runningAgent === agent.id ? <RotateCw size={16} className="animate-spin" /> : <Play size={16} />}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
                  <p className="text-slate-500 flex items-center gap-1"><Clock size={11} /> Schedule</p>
                  <p className="text-slate-200 font-medium mt-0.5">{formatCron(agent.cron)}</p>
                </div>
                <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
                  <p className="text-slate-500">Last Run</p>
                  <p className="text-slate-200 font-medium mt-0.5">{timeAgo(agent.lastRun)}</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className={`px-2 py-1 rounded-full border ${STATUS_STYLES[agent.status]}`}>
                  {agent.status.toUpperCase()}
                </span>
                <span className="text-slate-500">{agent.runsLast24h} runs in last 24h</span>
              </div>

              {agent.lastSummary && (
                <div className="bg-white/5 rounded-lg p-3 border border-white/5 text-xs">
                  <p className="text-slate-500 mb-1">Last Summary</p>
                  <p className="text-slate-300 font-mono truncate">{JSON.stringify(agent.lastSummary)}</p>
                </div>
              )}
            </div>
          )
        })}
      </div>}

      {/* Recent Events */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-4">Recent Agent Events</h3>
        <div className="space-y-2 max-h-[400px] overflow-auto">
          {data.recentEvents.length > 0 ? (
            data.recentEvents.map((event, i) => (
              <div key={i} className="flex items-start gap-3 py-2 border-b border-white/5 last:border-0 text-xs">
                <span className="text-slate-500 font-mono whitespace-nowrap">{new Date(event.ts).toLocaleTimeString()}</span>
                <span className="px-1.5 py-0.5 rounded bg-white/10 text-slate-300 font-medium">{event.from}</span>
                <span className="text-purple-300">{event.type}</span>
                {event.lead_id && <span className="text-slate-500">{event.lead_id}</span>}
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">No recent events.</p>
          )}
        </div>
      </div>
    </div>
  )
}
