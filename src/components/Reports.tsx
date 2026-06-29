import { useEffect, useState } from 'react'
import { FileText, Calendar, Sun, Moon, Shield } from 'lucide-react'

interface ReportList {
  daily: string[]
  weekly: string[]
}

export default function Reports() {
  const [reports, setReports] = useState<ReportList>({ daily: [], weekly: [] })
  const [activeReport, setActiveReport] = useState<{ content: string; filename: string } | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/reports').then(r => r.json()).then(setReports).catch(() => {})
  }, [])

  const loadReport = async (filename: string, subdir: string) => {
    setLoading(true)
    // Extract date and type from filename like "2026-04-10-morning.md"
    const match = filename.match(/^(\d{4}-\d{2}-\d{2})-(.+)\.md$/)
    if (match) {
      const [, date, type] = match
      try {
        const r = await fetch(`/api/reports/${type}?date=${date}`)
        if (r.ok) {
          const data = await r.json()
          setActiveReport({ content: data.content, filename })
        }
      } catch {}
    }
    setLoading(false)
  }

  const reportIcon = (filename: string) => {
    if (filename.includes('morning')) return <Sun size={14} className="text-amber-400" />
    if (filename.includes('evening')) return <Moon size={14} className="text-indigo-400" />
    if (filename.includes('qa')) return <Shield size={14} className="text-rose-400" />
    return <FileText size={14} className="text-slate-500" />
  }

  const reportLabel = (filename: string) => {
    const match = filename.match(/^(\d{4}-\d{2}-\d{2})-(.+)\.md$/)
    if (!match) return filename
    const [, date, type] = match
    const d = new Date(date + 'T12:00:00')
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const typeStr = type === 'morning' ? 'Morning Briefing' : type === 'evening' ? 'Evening Recon' : type === 'qa' ? 'QA Report' : type
    return `${dateStr} — ${typeStr}`
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <h2 className="text-2xl font-bold text-white">Reports</h2>

      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        {/* Report List */}
        <div className="md:w-72 md:flex-shrink-0 space-y-4">
          {/* Daily */}
          <div className="card">
            <h3 className="px-4 py-3 text-sm font-semibold text-slate-200 border-b border-white/10 flex items-center gap-2">
              <Calendar size={14} className="text-purple-400" /> Daily Reports
            </h3>
            {reports.daily.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500 text-center">No reports yet</p>
            ) : (
              <div className="divide-y divide-white/5 max-h-[400px] overflow-y-auto">
                {reports.daily.map(f => (
                  <button
                    key={f}
                    onClick={() => loadReport(f, 'daily')}
                    className={`w-full px-4 py-2.5 text-left flex items-center gap-2 hover:bg-white/[0.05] transition-colors ${
                      activeReport?.filename === f ? 'bg-purple-500/10' : ''
                    }`}
                  >
                    {reportIcon(f)}
                    <span className="text-sm text-slate-300">{reportLabel(f)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Weekly */}
          <div className="card">
            <h3 className="px-4 py-3 text-sm font-semibold text-slate-200 border-b border-white/10 flex items-center gap-2">
              <Calendar size={14} className="text-purple-400" /> Weekly Reports
            </h3>
            {reports.weekly.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500 text-center">No reports yet</p>
            ) : (
              <div className="divide-y divide-white/5 max-h-[300px] overflow-y-auto">
                {reports.weekly.map(f => (
                  <button
                    key={f}
                    onClick={() => loadReport(f, 'weekly')}
                    className={`w-full px-4 py-2.5 text-left flex items-center gap-2 hover:bg-white/[0.05] transition-colors ${
                      activeReport?.filename === f ? 'bg-purple-500/10' : ''
                    }`}
                  >
                    <FileText size={14} className="text-blue-400" />
                    <span className="text-sm text-slate-300">{f.replace('.md', '')}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Report Content */}
        <div className="flex-1 card min-h-[300px]">
          {loading ? (
            <div className="p-12 text-center text-slate-400">Loading report...</div>
          ) : activeReport ? (
            <div className="p-6">
              <h3 className="text-lg font-semibold text-white mb-4">{reportLabel(activeReport.filename)}</h3>
              <div className="prose prose-sm max-w-none">
                <pre className="whitespace-pre-wrap text-sm text-slate-300 font-sans leading-relaxed bg-slate-900/50 rounded-xl p-4 border border-white/10">
                  {activeReport.content}
                </pre>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center">
              <FileText size={40} className="mx-auto text-slate-600 mb-3" />
              <p className="text-slate-400">Select a report to view</p>
              <p className="text-xs text-slate-500 mt-1">Morning briefings, evening reconciliations, and QA reports appear here</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
