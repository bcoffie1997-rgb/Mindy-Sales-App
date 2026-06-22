import type { Agent, AgentContext, AgentResult } from './types.js'
import { readMasterSheet, updateLead, findLeadByEmail } from './data.js'
import { buildEvent } from './logger.js'

export const emailResponder: Agent = {
  id: 'gc-email-responder',
  name: 'Email Responder',

  async run(ctx: AgentContext): Promise<AgentResult> {
    const summary: Record<string, any> = { first_touch: 0, follow_ups: 0, replies_processed: 0, total: 0, errors: [] }
    const events = []
    const errors: string[] = []
    const signature = ctx.config?.email_signature || '\n\nBest,\nGovCon Giants Team'

    try {
      const leads = readMasterSheet(ctx.dataDir)
      const maxFollowUps = ctx.config?.follow_up?.max_follow_ups || 3
      const staleHours = ctx.config?.follow_up?.stale_hours || 48
      const now = ctx.now.getTime()

      // Process Gmail replies if available
      if (ctx.gmail.isEnabled()) {
        const replies = await ctx.gmail.listMessages('is:unread -from:me')
        for (const msg of replies) {
          const lead = findLeadByEmail(ctx.dataDir, msg.from)
          if (!lead) continue

          const isPositive = /(interested|yes|call|schedule|pricing|proposal|send me|book)/i.test(msg.subject + ' ' + msg.body)
          const isUnsub = /(unsubscribe|remove|stop|don't contact)/i.test(msg.subject + ' ' + msg.body)

          if (isUnsub) {
            updateLead(ctx.dataDir, lead.id, { status: 'unsubscribed', last_action: 'Unsubscribe request detected' })
          } else if (isPositive) {
            updateLead(ctx.dataDir, lead.id, { status: 'meeting_interest', last_action: 'Positive reply detected' })
          } else {
            updateLead(ctx.dataDir, lead.id, { last_action: 'Reply received', notes: (lead.notes || '') + '\n' + msg.body.slice(0, 300) })
          }

          summary.replies_processed++
          events.push(buildEvent(this.id, 'run_summary', { replies_processed: 1, name: lead.name }, lead.id))
        }
      }

      // Draft outreach for leads needing it
      for (const lead of leads) {
        if (lead.type === 'client') continue
        if (!lead.email) continue

        const lastAction = lead.last_action_date ? new Date(lead.last_action_date).getTime() : 0
        const hoursSince = lastAction ? (now - lastAction) / 36e5 : Infinity

        let drafted = false

        // First touch for new leads
        if (lead.status === 'new') {
          const subject = `Quick question about ${lead.company || 'your GovCon goals'}`
          const body = `Hi ${lead.name?.split(' ')[0] || 'there'},\n\nI noticed your interest in government contracting. I'd love to learn more about what you're working on and see if GovCon Giants can help.${signature}`
          updateLead(ctx.dataDir, lead.id, {
            status: 'first_touch_drafted',
            last_action: 'First-touch email drafted',
            draft_subject: subject,
            draft_body: body,
            follow_up_count: 0,
          })
          summary.first_touch++
          drafted = true
        }
        // Follow-up for stale leads
        else if (['first_touch_drafted', 'meeting_interest', 'post_call_followup'].includes(lead.status) && hoursSince >= staleHours) {
          const count = lead.follow_up_count || 0
          if (count < maxFollowUps) {
            const subject = 'Following up — GovCon Giants'
            const body = `Hi ${lead.name?.split(' ')[0] || 'there'},\n\nWanted to circle back and see if you had any thoughts on my last note. Happy to jump on a quick call if helpful.${signature}`
            updateLead(ctx.dataDir, lead.id, {
              status: 'follow_up_drafted',
              last_action: `Follow-up #${count + 1} drafted`,
              draft_subject: subject,
              draft_body: body,
              follow_up_count: count + 1,
            })
            summary.follow_ups++
            drafted = true
          }
        }

        if (drafted) {
          summary.total++
          events.push(buildEvent(this.id, 'schedule_follow_up', { name: lead.name, status: lead.status }, lead.id))
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
