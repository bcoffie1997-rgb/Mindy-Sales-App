export interface AgentSchedule {
  id: string
  name: string
  cron: string
  description: string
}

export const agentSchedules: AgentSchedule[] = [
  {
    id: 'gc-lead-intake',
    name: 'Lead Intake & Scoring',
    cron: '*/30 9-18 * * 1-5',
    description: 'Monitors Gmail for new leads and scores them HOT/WARM/BASIC',
  },
  {
    id: 'gc-email-responder',
    name: 'Email Responder & Follow-Up',
    cron: '32 9-17 * * 1-5',
    description: 'Drafts first-touch emails and monitors replies',
  },
  {
    id: 'gc-appointment-setter',
    name: 'Appointment Setter',
    cron: '57 9,11,13,15,17 * * 1-5',
    description: 'Sends Calendly links, confirmations, reminders, and pre-call briefings',
  },
  {
    id: 'gc-post-call',
    name: 'Post-Call & Proposal',
    cron: '50 9-17 * * 1-5',
    description: 'Pulls Fireflies transcripts and drafts follow-ups/proposals',
  },
  {
    id: 'gc-crm-morning',
    name: 'CRM Morning Briefing',
    cron: '7 7 * * 1-5',
    description: 'Generates morning pipeline report and action plan',
  },
  {
    id: 'gc-qa-health',
    name: 'QA & System Health',
    cron: '23 7 * * 1-5',
    description: 'Validates data cleanliness and agent health',
  },
  {
    id: 'gc-crm-evening',
    name: 'CRM Evening Reconciliation',
    cron: '39 17 * * 1-5',
    description: 'End-of-day wrap-up and uncalled HOT leads list',
  },
]

export function getNextRun(cronExpr: string, timezone = 'America/New_York'): string | null {
  try {
    // Use node-cron's getTasks if available; otherwise return null
    // This is a placeholder for future scheduler integration
    return null
  } catch {
    return null
  }
}
