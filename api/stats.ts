import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_lib/supabase'

const AGENTS = [
  'gc-lead-intake', 'gc-email-responder', 'gc-appointment-setter',
  'gc-post-call', 'gc-crm-morning', 'gc-crm-evening', 'gc-qa-health'
]

const PROPOSAL_KEYWORDS = [
  'proposal sent', 'proposal delivered', 'pricing sent',
  'engagement letter', 'sent proposal', 'sent pricing', 'payment link'
]

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const [{ data: all, error: leadsErr }, { data: events, error: eventsErr }] = await Promise.all([
      supabase.from('leads').select('*'),
      supabase.from('agent_events').select('agent_name, event_type, ts').eq('event_type', 'run_summary')
    ])

    if (leadsErr) throw leadsErr

    const leads = (all || []).filter((l: any) => l.type !== 'client')
    const clients = (all || []).filter((l: any) => l.type === 'client')

    const byScore: Record<string, number> = {}
    const byStatus: Record<string, number> = {}
    for (const l of leads) {
      if (l.score) byScore[l.score] = (byScore[l.score] || 0) + 1
      if (l.status) byStatus[l.status] = (byStatus[l.status] || 0) + 1
    }

    const clientsByTier: Record<string, number> = {}
    const clientsByStatus: Record<string, number> = {}
    for (const c of clients) {
      const tier = c.client_tier || 'unknown'
      const cs = c.client_status || 'active'
      clientsByTier[tier] = (clientsByTier[tier] || 0) + 1
      clientsByStatus[cs] = (clientsByStatus[cs] || 0) + 1
    }

    const now = Date.now()
    const todayStr = new Date().toDateString()
    const agentHealth: Record<string, any> = {}

    for (const agent of AGENTS) {
      const runs = (events || []).filter((e: any) => e.agent_name === agent)
      const last = runs[runs.length - 1]
      const runsToday = runs.filter((e: any) => new Date(e.ts).toDateString() === todayStr).length
      agentHealth[agent] = {
        lastRun: last?.ts || null,
        runsToday,
        status: last ? (now - new Date(last.ts).getTime() < 86400000 ? 'ok' : 'stale') : 'never'
      }
    }

    const proposalsOut = (all || []).filter((l: any) => {
      if (l.status === 'proposal_sent') return true
      const combined = ((l.last_action || '') + ' ' + (l.notes || '')).toLowerCase()
      return PROPOSAL_KEYWORDS.some(kw => combined.includes(kw))
    }).length

    res.json({
      total: (all || []).length,
      totalLeads: leads.length,
      totalClients: clients.length,
      byScore,
      byStatus,
      clientsByTier,
      clientsByStatus,
      agentHealth,
      proposalsOut,
      recentLeads: leads.filter((l: any) => l.status !== 'paid').slice(-5).reverse(),
      recentClients: clients.slice(-5).reverse()
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}
