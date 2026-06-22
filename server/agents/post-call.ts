import type { Agent, AgentContext, AgentResult } from './types.js'
import { readMasterSheet, updateLead, findLeadByEmail } from './data.js'
import { buildEvent } from './logger.js'

export const postCall: Agent = {
  id: 'gc-post-call',
  name: 'Post-Call',

  async run(ctx: AgentContext): Promise<AgentResult> {
    const summary: Record<string, any> = { processed: 0, proposals: 0, follow_ups: 0, errors: [] }
    const events = []
    const errors: string[] = []

    try {
      const leads = readMasterSheet(ctx.dataDir)

      // Process Fireflies transcripts if configured
      if (ctx.fireflies.isEnabled()) {
        const since = new Date(ctx.now.getTime() - 2 * 86400000).toISOString()
        const transcripts = await ctx.fireflies.listTranscripts(since, 50)

        for (const tx of transcripts) {
          const attendeeEmails = tx.attendees.map(a => a.email?.toLowerCase()).filter(Boolean)
          const lead = leads.find((l: any) => attendeeEmails.includes(l.email?.toLowerCase())) ||
                       leads.find((l: any) => l.phone && tx.attendees.some((a: any) => a.phone?.replace(/\D/g, '') === l.phone.replace(/\D/g, '')))

          if (!lead) continue

          const wantsProposal = /(proposal|pricing|send me|quote|bid|rfp|rfq)/i.test(tx.summary)
          const wantsMeeting = /(schedule|book a call|let's talk|follow up)/i.test(tx.summary)

          let status = 'call_completed'
          if (wantsProposal) status = 'proposal_sent'
          else if (wantsMeeting) status = 'meeting_interest'

          updateLead(ctx.dataDir, lead.id, {
            status,
            last_action: `Call processed via Fireflies: ${tx.title}`,
            follow_up_count: (lead.follow_up_count || 0) + 1,
            notes: (lead.notes || '') + '\n\nFireflies summary:\n' + tx.summary.slice(0, 1000),
          })

          summary.processed++
          if (wantsProposal) summary.proposals++
          else summary.follow_ups++

          events.push(buildEvent(this.id, 'call_completed', { transcript_id: tx.id, name: lead.name }, lead.id))
        }
      }

      // Fallback: process locally booked calls that have passed
      for (const lead of leads) {
        if (lead.type === 'client') continue
        if (lead.status === 'booked' && lead.next_call_date) {
          const callTime = new Date(lead.next_call_date).getTime()
          if (ctx.now.getTime() > callTime + 30 * 60000) {
            updateLead(ctx.dataDir, lead.id, {
              status: 'call_completed',
              last_action: 'Call completed; follow-up drafted',
              follow_up_count: (lead.follow_up_count || 0) + 1,
            })
            summary.processed++
            summary.follow_ups++
            events.push(buildEvent(this.id, 'call_completed', { name: lead.name }, lead.id))
          }
        }

        const notes = (lead.notes || '').toLowerCase()
        if (['call_completed', 'active_dialog'].includes(lead.status) &&
            (notes.includes('proposal') || notes.includes('pricing') || notes.includes('send me'))) {
          updateLead(ctx.dataDir, lead.id, { status: 'proposal_sent', last_action: 'Proposal drafted/sent' })
          summary.proposals++
          events.push(buildEvent(this.id, 'run_summary', { proposals_generated: 1, name: lead.name }, lead.id))
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
