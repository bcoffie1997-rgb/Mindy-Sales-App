import type { Agent, AgentContext, AgentResult } from './types.js'
import { readMasterSheet, updateLead, createLead, findLeadByEmail } from './data.js'
import { buildEvent } from './logger.js'

function parseName(fromHeader: string): { name: string; email: string } {
  const match = fromHeader.match(/(.*?)\s*<([^>]+)>/)
  if (match) {
    return { name: match[1].trim().replace(/"/g, ''), email: match[2].trim() }
  }
  return { name: fromHeader.split('@')[0], email: fromHeader.trim() }
}

function shouldExcludeEmail(email: string, patterns: string[] = []): boolean {
  const lower = email.toLowerCase()
  return patterns.some(p => lower.includes(p.toLowerCase()))
}

export const leadIntake: Agent = {
  id: 'gc-lead-intake',
  name: 'Lead Intake',

  async run(ctx: AgentContext): Promise<AgentResult> {
    const summary: Record<string, any> = { new_leads: 0, scored: 0, hot: 0, warm: 0, basic: 0, errors: [] }
    const events = []
    const errors: string[] = []

    try {
      const hotKeywords = ctx.config?.scoring?.hot_keywords || []
      const warmKeywords = ctx.config?.scoring?.warm_keywords || []
      const excludeSenders = ctx.config?.scoring?.exclude_senders || []

      // 1. Ingest from Gmail if configured
      if (ctx.gmail.isEnabled()) {
        const messages = await ctx.gmail.listUnread()
        for (const msg of messages) {
          const { name, email } = parseName(msg.from)
          if (shouldExcludeEmail(email, excludeSenders)) continue

          let lead = findLeadByEmail(ctx.dataDir, email)
          if (!lead) {
            lead = createLead(ctx.dataDir, {
              name,
              email,
              source: 'gmail',
              notes: `Subject: ${msg.subject}\n${msg.body.slice(0, 500)}`,
            })
            summary.new_leads++
            events.push(buildEvent(this.id, 'new_lead', { name, email, score: lead.score, source: 'gmail' }, lead.id))
          }
        }
      }

      // 2. Score all BASIC leads
      const leads = readMasterSheet(ctx.dataDir)
      for (const lead of leads) {
        if (lead.score && lead.score !== 'BASIC') continue

        const text = `${lead.name || ''} ${lead.company || ''} ${lead.notes || ''} ${lead.problem || ''}`.toLowerCase()
        let score = 'BASIC'
        if (hotKeywords.some((kw: string) => text.includes(kw.toLowerCase()))) score = 'HOT'
        else if (warmKeywords.some((kw: string) => text.includes(kw.toLowerCase()))) score = 'WARM'

        if (score !== lead.score) {
          updateLead(ctx.dataDir, lead.id, { score, last_action: `Scored ${score} by Lead Intake` })
          summary.scored++
          if (score === 'HOT') summary.hot++
          if (score === 'WARM') summary.warm++
          if (score === 'BASIC') summary.basic++
          events.push(buildEvent(this.id, 'hot_lead', { score, name: lead.name, company: lead.company }, lead.id))
        }
      }

      events.push(buildEvent(this.id, 'run_summary', summary))
    } catch (err: any) {
      errors.push(err.message)
      summary.errors.push(err.message)
    }

    return { success: errors.length === 0, summary, errors, events }
  },
}
