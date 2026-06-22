import { leadIntake } from './lead-intake.js'
import { emailResponder } from './email-responder.js'
import { appointmentSetter } from './appointment-setter.js'
import { postCall } from './post-call.js'
import { crmMorning } from './crm-morning.js'
import { crmEvening } from './crm-evening.js'
import { qaHealth } from './qa-health.js'
import type { Agent, AgentContext, AgentResult } from './types.js'

export const agents: Agent[] = [
  leadIntake,
  emailResponder,
  appointmentSetter,
  postCall,
  crmMorning,
  crmEvening,
  qaHealth,
]

export function getAgent(id: string): Agent | undefined {
  return agents.find(a => a.id === id)
}

export { leadIntake, emailResponder, appointmentSetter, postCall, crmMorning, crmEvening, qaHealth }
export type { Agent, AgentContext, AgentResult }
