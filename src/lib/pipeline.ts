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
