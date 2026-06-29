import { useEffect, useState } from 'react'
import { RefreshCw, Database, CreditCard, Calendar, Mic, Users, CheckCircle, AlertTriangle, XCircle, Clock } from 'lucide-react'

interface SystemStatus {
  key: string; name: string; vendor: string; status: 'operational' | 'degraded' | 'down' | 'not_configured'
  metric?: string; lastChecked?: string; detail?: string
}

interface HealthData {
  overall: 'operational' | 'degraded' | 'down'
  operational: number; total: number; checkedAt: string
  systems: SystemStatus[]
}

const SYSTEM_ICONS: Record<string, any> = {
  database: Database, stripe: CreditCard, wave: CreditCard,
  ghl: Users, fireflies: Mic, calendar: Calendar,
}

const STATUS_CONFIG = {
  operational: { label: 'Operational', dot: 'bg-emerald-500', text: 'text-emerald-400', border: 'border-emerald-500/30', Icon: CheckCircle },
  degraded: { label: 'Degraded', dot: 'bg-amber-500', text: 'text-amber-400', border: 'border-amber-500/30', Icon: AlertTriangle },
  down: { label: 'Down', dot: 'bg-red-500', text: 'text-red-400', border: 'border-red-500/30', Icon: XCircle },
  not_configured: { label: 'Not configured', dot: 'bg-slate-500', text: 'text-slate-400', border: 'border-white/10', Icon: Clock },
}

function timeAgo(iso: string) {
  if (!iso) return ''
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

export default function CommandCenter() {
  const [data, setData] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)

  async function runCheck() {
    setLoading(true)
    const result = await fetch('/api/command-center').then(r => r.json()).catch(() => null)
    setData(result)
    setLoading(false)
  }

  useEffect(() => {
    runCheck()
    const interval = setInterval(runCheck, 60000)
    return () => clearInterval(interval)
  }, [])

  const overall = data?.overall || 'operational'
  const overallConfig = {
    operational: { bg: 'from-emerald-600/20 to-emerald-500/5', border: 'border-emerald-500/30', text: 'text-emerald-300', msg: 'All systems operational' },
    degraded: { bg: 'from-amber-600/20 to-amber-500/5', border: 'border-amber-500/30', text: 'text-amber-300', msg: 'Some systems degraded' },
    down: { bg: 'from-red-600/20 to-red-500/5', border: 'border-red-500/30', text: 'text-red-300', msg: 'Outage detected' },
  }[overall]

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Command Center</h2>
          <p className="text-slate-400 text-sm mt-1">Live status of every connected system</p>
        </div>
        <button onClick={runCheck} disabled={loading} className="btn-primary flex items-center gap-2 text-sm px-4 py-2 disabled:opacity-50 self-start sm:self-auto">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Checking…' : 'Run check'}
        </button>
      </div>

      {data && overallConfig && (
        <div className={`rounded-xl border bg-gradient-to-r ${overallConfig.bg} ${overallConfig.border} px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2`}>
          <div className="flex items-center gap-3">
            <span className={`w-2.5 h-2.5 rounded-full ${STATUS_CONFIG[overall].dot} ${overall !== 'operational' ? 'animate-pulse' : ''}`} />
            <span className={`font-semibold ${overallConfig.text}`}>{overallConfig.msg}</span>
            <span className="text-slate-400 text-sm">· {data.operational}/{data.total} operational</span>
          </div>
          <span className="text-xs text-slate-500">Checked {timeAgo(data.checkedAt)}</span>
        </div>
      )}

      {loading && !data ? (
        <div className="text-center text-slate-400 py-12">Running health checks…</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(data?.systems || []).map(system => {
            const cfg = STATUS_CONFIG[system.status] || STATUS_CONFIG.not_configured
            const Icon = SYSTEM_ICONS[system.key] || Database
            return (
              <div key={system.key} className={`card p-5 border ${cfg.border}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                      <Icon size={18} className="text-slate-300" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white text-sm">{system.name}</h3>
                      <p className="text-xs text-slate-500">{system.vendor}</p>
                    </div>
                  </div>
                  <span className={`flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
                    <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                    {cfg.label}
                  </span>
                </div>
                {(system.metric || system.detail) && (
                  <div className="mt-4">
                    {system.metric && <p className="text-lg font-bold text-white leading-tight">{system.metric}</p>}
                    {system.detail && <p className="text-xs text-slate-500 mt-0.5">{system.detail}</p>}
                  </div>
                )}
                {system.lastChecked && (
                  <p className="text-xs text-slate-600 mt-3">Last checked {timeAgo(system.lastChecked)}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
