/**
 * Board-level lead state read from the lead's `metadata` blob.
 *
 * `in_pipeline` decides whether a lead appears on the Leads / Pipeline board at
 * all. A missing key counts as false, which is what keeps the ~2.5k imported
 * leads off the board without having to write a flag onto every one of them.
 *
 * `temperature` drives the card badge and the sort order inside a column.
 */
export type Temperature = 'hot' | 'warm' | 'cold'

const TEMPERATURES: Temperature[] = ['hot', 'warm', 'cold']

/** Lower sorts first: hot, warm, cold, then anything untagged. */
const TEMPERATURE_RANK: Record<Temperature, number> = { hot: 0, warm: 1, cold: 2 }
const UNTAGGED_RANK = 3

export const TEMPERATURE_BADGE: Record<Temperature, string> = {
  hot: 'bg-red-500/20 text-red-300 border-red-500/30',
  warm: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  cold: 'bg-white/10 text-slate-400 border-white/15',
}

export function isInPipeline(metadata: unknown): boolean {
  const value = (metadata as Record<string, unknown> | null)?.in_pipeline
  // Supabase can hand a JSONB boolean back as the string "true"
  return value === true || value === 'true'
}

/** Returns null for an absent, empty or unrecognised value — no badge shown. */
export function temperatureOf(metadata: unknown): Temperature | null {
  const raw = (metadata as Record<string, unknown> | null)?.temperature
  if (typeof raw !== 'string') return null
  const normalized = raw.trim().toLowerCase()
  return (TEMPERATURES as string[]).includes(normalized) ? (normalized as Temperature) : null
}

function temperatureRank(metadata: unknown): number {
  const temperature = temperatureOf(metadata)
  return temperature === null ? UNTAGGED_RANK : TEMPERATURE_RANK[temperature]
}

/**
 * Card order inside a column: hot first, then warm, then cold, then untagged;
 * within each group the most recent `last_action_date` first. Rows with no date
 * sort last within their group rather than jumping to the top.
 */
export function compareCards(
  a: { metadata?: unknown; last_action_date?: string | null },
  b: { metadata?: unknown; last_action_date?: string | null },
): number {
  const byTemperature = temperatureRank(a.metadata) - temperatureRank(b.metadata)
  if (byTemperature !== 0) return byTemperature
  const dateA = a.last_action_date || ''
  const dateB = b.last_action_date || ''
  if (dateA === dateB) return 0
  if (!dateA) return 1
  if (!dateB) return -1
  return dateB.localeCompare(dateA)
}

/** The pipeline stages, shared by the board and the add/create pickers. */
export const STAGE_OPTIONS: { status: string; label: string }[] = [
  { status: 'meeting_interest', label: 'Interested' },
  { status: 'booked', label: 'Call Booked' },
  { status: 'call_completed', label: 'Call Done' },
  { status: 'proposal_sent', label: 'Proposal Sent' },
  { status: 'no_show', label: 'No Show' },
  { status: 'closed_won', label: 'Won' },
  { status: 'closed_lost', label: 'Lost' },
]

export interface SearchableLead {
  id: string
  name?: string | null
  email?: string | null
  company?: string | null
}

/**
 * Match a lead against a free-text query on name, email or company.
 * Every whitespace-separated term must appear somewhere, so "joe valor"
 * finds Joe Cary at After Valor Services.
 */
export function matchesQuery(lead: SearchableLead, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return false
  const haystack = [lead.name, lead.email, lead.company]
    .filter(Boolean).join(' ').toLowerCase()
  return terms.every(term => haystack.includes(term))
}

/** Ranked, capped search results for the add-to-pipeline and add-client boxes. */
export function searchLeads<T extends SearchableLead>(leads: T[], query: string, limit = 8): T[] {
  const q = query.trim()
  if (q.length < 2) return []
  const hits = leads.filter(lead => matchesQuery(lead, q))
  const lower = q.toLowerCase()
  // Name-prefix matches first — typing a name should surface that person
  hits.sort((a, b) => {
    const aStarts = (a.name || '').toLowerCase().startsWith(lower) ? 0 : 1
    const bStarts = (b.name || '').toLowerCase().startsWith(lower) ? 0 : 1
    if (aStarts !== bStarts) return aStarts - bStarts
    return (a.name || '').localeCompare(b.name || '')
  })
  return hits.slice(0, limit)
}

export interface NewLeadInput {
  name: string
  email?: string
  company?: string
  phone?: string
  status: string
  temperature?: Temperature | ''
  oppValue?: number | null
  note?: string
}

/** Body for POST /api/leads from the "+ New lead" form. */
export function buildNewLeadBody(input: NewLeadInput): Record<string, unknown> {
  const metadata: Record<string, unknown> = { in_pipeline: true }
  if (input.temperature) metadata.temperature = input.temperature
  if (typeof input.oppValue === 'number' && Number.isFinite(input.oppValue) && input.oppValue > 0) {
    metadata.opp_value = input.oppValue
  }
  return {
    name: input.name.trim(),
    email: input.email?.trim() || undefined,
    company: input.company?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    status: input.status,
    notes: input.note?.trim() || undefined,
    score: input.temperature === 'hot' ? 'HOT' : input.temperature === 'cold' ? 'BASIC' : 'WARM',
    metadata,
  }
}

export interface NewClientInput {
  name: string
  email?: string
  company?: string
  phone?: string
  consultant?: string
  packageLabel: string
  packageAmount: number | null
  sessionsTotal: number | null
  amountPaid: number | null
  balanceDue: number | null
  nextPaymentDue?: string
  startDate?: string
  note?: string
}

/**
 * Body for POST /api/leads from "+ Add client". New clients land on
 * closed_won so they appear in Won on the board as well as the BD roster.
 */
export function buildNewClientBody(input: NewClientInput): Record<string, unknown> {
  const metadata: Record<string, unknown> = { managed: true, in_pipeline: true }
  if (input.consultant?.trim()) metadata.consultant = input.consultant.trim()
  if (typeof input.sessionsTotal === 'number' && input.sessionsTotal > 0) {
    metadata.sessions_total = input.sessionsTotal
  }
  if (typeof input.packageAmount === 'number' && input.packageAmount > 0) {
    metadata.opp_value = input.packageAmount
  }
  if (typeof input.amountPaid === 'number') metadata.amount_paid = input.amountPaid
  if (typeof input.balanceDue === 'number') metadata.balance_due = input.balanceDue
  // A due date only means something while money is still owed
  if (input.nextPaymentDue && (input.balanceDue ?? 0) > 0) {
    metadata.next_payment_due = input.nextPaymentDue
  }
  return {
    name: input.name.trim(),
    email: input.email?.trim() || undefined,
    company: input.company?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    status: 'closed_won',
    score: 'HOT',
    notes: input.note?.trim() || undefined,
    client_tier: 'consulting',
    client_product: input.packageLabel,
    client_amount: typeof input.packageAmount === 'number' ? input.packageAmount : undefined,
    client_start_date: input.startDate || undefined,
    metadata,
  }
}
