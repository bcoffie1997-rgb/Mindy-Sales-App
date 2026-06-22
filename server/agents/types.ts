import type { SlackClient } from '../integrations/slack.js'
import type { GmailClient } from '../integrations/gmail.js'
import type { GoogleCalendarClient } from '../integrations/calendar.js'
import type { FirefliesClient } from '../integrations/fireflies.js'

export interface AgentContext {
  dataDir: string
  config: any
  now: Date
  timezone: string
  slack: SlackClient
  gmail: GmailClient
  calendar: GoogleCalendarClient
  fireflies: FirefliesClient
}

export interface AgentResult {
  success: boolean
  summary: Record<string, any>
  errors: string[]
  events: AgentEvent[]
}

export interface AgentEvent {
  ts: string
  from: string
  to: string
  type: string
  lead_id?: string
  payload?: any
}

export interface Agent {
  id: string
  name: string
  run(ctx: AgentContext): Promise<AgentResult>
}
