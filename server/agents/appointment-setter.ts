import type { Agent, AgentContext, AgentResult } from './types.js'
import { readJSON, readMasterSheet, updateLead, findLeadByEmail, writeJSON, localDateStr, eventDateStr } from './data.js'
import { buildEvent } from './logger.js'

function buildCallFromLead(lead: any, start: string, end: string): any {
  return {
    event_id: `local-${lead.id}-${start}`,
    title: `Call with ${lead.name}`,
    start,
    end,
    location: lead.calendly_link || '',
    status: 'confirmed',
    minutes_until: 0,
    attendees: [{ email: lead.email || '', name: lead.name || '', response: 'accepted' }],
    lead_match: {
      id: lead.id,
      name: lead.name,
      company: lead.company || '',
      score: lead.score || 'BASIC',
      type: lead.type || 'lead',
      client_tier: lead.client_tier || null,
      status: lead.status,
      phone: lead.phone || '',
      notes: lead.notes || '',
      problem: lead.problem || '',
      industry: lead.company_details?.industry || '',
      revenue: lead.company_details?.revenue || '',
      total_calls: lead.calendly?.total_calls || 0,
      source: lead.source || '',
      recommended_angle: lead.recommended_angle || '',
    },
  }
}

function buildCallFromCalendar(evt: any, lead: any): any {
  return {
    event_id: evt.id,
    title: evt.title,
    start: evt.start,
    end: evt.end,
    location: evt.location || '',
    status: 'confirmed',
    minutes_until: 0,
    attendees: evt.attendees || [],
    lead_match: lead ? {
      id: lead.id,
      name: lead.name,
      company: lead.company || '',
      score: lead.score || 'BASIC',
      type: lead.type || 'lead',
      client_tier: lead.client_tier || null,
      status: lead.status,
      phone: lead.phone || '',
      notes: lead.notes || '',
      problem: lead.problem || '',
      industry: lead.company_details?.industry || '',
      revenue: lead.company_details?.revenue || '',
      total_calls: lead.calendly?.total_calls || 0,
      source: lead.source || '',
      recommended_angle: lead.recommended_angle || '',
    } : null,
  }
}

export const appointmentSetter: Agent = {
  id: 'gc-appointment-setter',
  name: 'Appointment Setter',

  async run(ctx: AgentContext): Promise<AgentResult> {
    const summary: Record<string, any> = { booked: 0, reminders_24hr: 0, reminders_1hr: 0, no_shows: 0, calls_regenerated: 0, errors: [] }
    const events = []
    const errors: string[] = []

    try {
      const leads = readMasterSheet(ctx.dataDir)
      const now = ctx.now.getTime()
      const tz = ctx.timezone
      const todayStr = localDateStr(ctx.now, tz)
      const tomorrowStr = localDateStr(new Date(now + 86400000), tz)

      const freshCalls: any = { generated_at: ctx.now.toISOString(), today: [], tomorrow: [], this_week: [] }

      // Fetch real Google Calendar events if configured
      if (ctx.calendar.isEnabled()) {
        const since = new Date(ctx.now.getTime() - 1 * 86400000).toISOString()
        const until = new Date(ctx.now.getTime() + 14 * 86400000).toISOString()
        const calEvents = await ctx.calendar.listEvents(since, until)

        for (const evt of calEvents) {
          const leadEmail = evt.attendees?.[0]?.email
          const lead = leadEmail ? findLeadByEmail(ctx.dataDir, leadEmail) : null

          const call = buildCallFromCalendar(evt, lead)
          const startDate = eventDateStr(evt.start, tz)
          if (startDate === todayStr) freshCalls.today.push(call)
          else if (startDate === tomorrowStr) freshCalls.tomorrow.push(call)
          else freshCalls.this_week.push(call)

          if (lead && (lead.status === 'meeting_interest' || lead.status === 'wants_meeting')) {
            updateLead(ctx.dataDir, lead.id, {
              status: 'booked',
              last_action: `Meeting booked for ${evt.start}`,
              next_call_date: evt.start,
            })
            summary.booked++
            events.push(buildEvent(this.id, 'booking_confirmed', { call_date: evt.start, name: lead.name }, lead.id))
          }
        }
      }

      // Fallback: regenerate from locally booked leads
      const bookedLeads = leads.filter((l: any) => l.status === 'booked' && l.next_call_date)
      for (const lead of bookedLeads) {
        const start = lead.next_call_date
        const startDate = eventDateStr(start, tz)
        const startTime = new Date(start).getTime()
        const endTime = new Date(startTime + 30 * 60000).toISOString()
        const call = buildCallFromLead(lead, start, endTime)
        if (startDate === todayStr) freshCalls.today.push(call)
        else if (startDate === tomorrowStr) freshCalls.tomorrow.push(call)
        else freshCalls.this_week.push(call)
      }

      // Preserve cold/self-book calls (incl. those with no lead match) from the prior
      // snapshot — but RE-BUCKET them by date and DROP anything already past today, so
      // stale calls can't linger in the file indefinitely. Dedup by event_id.
      const existing = readJSON(ctx.dataDir, 'today-calls.json') || { today: [], tomorrow: [], this_week: [] }
      const freshEventIds = new Set([...freshCalls.today, ...freshCalls.tomorrow, ...freshCalls.this_week].map((c: any) => c.event_id))
      for (const call of [...existing.today, ...existing.tomorrow, ...existing.this_week]) {
        if (freshEventIds.has(call.event_id)) continue
        const d = eventDateStr(call.start, tz)
        if (!d || d < todayStr) continue // stale / past — drop
        if (d === todayStr) freshCalls.today.push(call)
        else if (d === tomorrowStr) freshCalls.tomorrow.push(call)
        else freshCalls.this_week.push(call)
      }

      writeJSON(ctx.dataDir, 'today-calls.json', freshCalls)
      summary.calls_regenerated = freshCalls.today.length + freshCalls.tomorrow.length + freshCalls.this_week.length

      // Reminders & no-shows across all calls
      const allCalls = [...freshCalls.today, ...freshCalls.tomorrow, ...freshCalls.this_week]
      for (const call of allCalls) {
        const start = new Date(call.start).getTime()
        const end = new Date(call.end).getTime()
        const minsUntil = (start - now) / 60000
        const isPast = now > end

        const lead = call.lead_match
        if (!lead) continue

        if (!isPast) {
          if (minsUntil <= 1440 && minsUntil > 1380) summary.reminders_24hr++
          else if (minsUntil <= 60 && minsUntil > 0) summary.reminders_1hr++
        }

        // Only flag a no-show when the invite was actually well-formed (had an attendee).
        // Self-booked / broken Calendly invites often lack host+attendee — flagging those
        // as no-shows has produced false positives that cost real HOT calls.
        const hasAttendee = Array.isArray(call.attendees) && call.attendees.length > 0
        if (lead.status === 'booked' && isPast && minsUntil < -30 && hasAttendee) {
          updateLead(ctx.dataDir, lead.id, { status: 'no_show', last_action: 'No-show detected' })
          summary.no_shows++
          events.push(buildEvent(this.id, 'no_show', { name: lead.name, call_date: call.start }, lead.id))
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
