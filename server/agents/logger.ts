import fs from 'fs'
import path from 'path'
import type { AgentEvent } from './types.js'

export function appendEvent(dataDir: string, event: AgentEvent) {
  const file = path.join(dataDir, 'agent-events.jsonl')
  const line = JSON.stringify(event) + '\n'
  fs.appendFileSync(file, line)
}

export function appendEvents(dataDir: string, events: AgentEvent[]) {
  for (const e of events) appendEvent(dataDir, e)
}

export function buildEvent(from: string, type: string, payload?: any, leadId?: string): AgentEvent {
  return {
    ts: new Date().toISOString(),
    from,
    to: 'system',
    type,
    ...(leadId && { lead_id: leadId }),
    ...(payload && { payload }),
  }
}
