import { ExternalLink } from 'lucide-react'

const MINDY_URL = 'https://getmindy.ai/command-center'

export default function MindyCC() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-white/10">
        <div>
          <h2 className="text-lg font-bold text-white">Mindy Command Center</h2>
          <p className="text-xs text-slate-500">Federal market intelligence · from getmindy.ai</p>
        </div>
        <a
          href={MINDY_URL}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-xs text-purple-300 hover:text-white transition-colors"
        >
          Open in new tab <ExternalLink size={13} />
        </a>
      </div>
      <iframe
        src={MINDY_URL}
        title="Mindy Command Center"
        className="flex-1 w-full border-0 bg-white"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  )
}
