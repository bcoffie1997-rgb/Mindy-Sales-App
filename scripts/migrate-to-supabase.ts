import 'dotenv/config'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BATCH_SIZE = 100
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = path.join(rootDir, 'data')
const apply = process.argv.includes('--apply')
const unknownArgs = process.argv.slice(2).filter((arg) => arg !== '--apply')

if (unknownArgs.length > 0) {
  throw new Error(`Unknown argument(s): ${unknownArgs.join(', ')}. Use --apply to write data.`)
}

type JsonRecord = Record<string, unknown>

type MigrationData = {
  leads: JsonRecord[]
  events: JsonRecord[]
  reports: JsonRecord[]
  calls: JsonRecord
}

function asRecord(value: unknown, context: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${context} must be a JSON object`)
  }
  return value as JsonRecord
}

function requiredString(value: unknown, context: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${context} must be a non-empty string`)
  }
  return value
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function optionalDate(value: unknown, context: string): string | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = new Date(String(value))
  if (Number.isNaN(parsed.getTime())) throw new Error(`${context} is not a valid date`)
  return parsed.toISOString().slice(0, 10)
}

function optionalTimestamp(value: unknown, context: string): string | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = new Date(String(value))
  if (Number.isNaN(parsed.getTime())) throw new Error(`${context} is not a valid timestamp`)
  return parsed.toISOString()
}

function optionalNumber(value: unknown, context: string, allowDescriptiveValue = false): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const match = String(value)
    .trim()
    .match(/^\$?\s*([\d,]+(?:\.\d+)?)\s*([kKmM])?(?:\s*\/\s*(?:mo(?:nth)?|yr|year))?$/)
  if (!match) {
    if (allowDescriptiveValue) return null
    throw new Error(`${context} must be numeric`)
  }
  const multiplier = match[2]?.toLowerCase() === 'k' ? 1_000 : match[2]?.toLowerCase() === 'm' ? 1_000_000 : 1
  const parsed = Number(match[1].replaceAll(',', '')) * multiplier
  if (!Number.isFinite(parsed)) throw new Error(`${context} must be numeric`)
  return parsed
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as JsonRecord)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function eventFingerprint(event: JsonRecord): string {
  return stableJson({
    ts: optionalTimestamp(event.ts, 'agent event ts'),
    agent_name: event.agent_name ?? null,
    event_type: event.event_type ?? null,
    data: event.data ?? {},
  })
}

function assertUnique(rows: JsonRecord[], key: string, context: string): void {
  const seen = new Set<unknown>()
  for (const row of rows) {
    if (seen.has(row[key])) throw new Error(`${context} contains duplicate ${key}: ${String(row[key])}`)
    seen.add(row[key])
  }
}

async function loadLeads(): Promise<JsonRecord[]> {
  const source = JSON.parse(await fs.readFile(path.join(dataDir, 'master-sheet.json'), 'utf8'))
  if (!Array.isArray(source)) throw new Error('data/master-sheet.json must contain an array')

  const columns = new Set([
    'id',
    'type',
    'name',
    'email',
    'phone',
    'company',
    'score',
    'source',
    'status',
    'first_contact_date',
    'last_action',
    'last_action_date',
    'follow_up_count',
    'notes',
    'client_tier',
    'client_product',
    'client_amount',
    'client_start_date',
    'client_status',
  ])

  const leads = source.map((value, index) => {
    const lead = asRecord(value, `master-sheet row ${index + 1}`)
    const metadata = Object.fromEntries(Object.entries(lead).filter(([key]) => !columns.has(key)))
    const clientAmount = optionalNumber(
      lead.client_amount,
      `master-sheet row ${index + 1} client_amount`,
      true,
    )
    if (clientAmount === null && lead.client_amount !== null && lead.client_amount !== undefined && lead.client_amount !== '') {
      metadata.client_amount_raw = lead.client_amount
    }
    return {
      id: requiredString(lead.id, `master-sheet row ${index + 1} id`),
      type: optionalString(lead.type) ?? 'lead',
      name: requiredString(lead.name, `master-sheet row ${index + 1} name`),
      email: optionalString(lead.email),
      phone: optionalString(lead.phone),
      company: optionalString(lead.company),
      score: optionalString(lead.score) ?? 'warm',
      source: optionalString(lead.source),
      status: optionalString(lead.status) ?? 'new',
      first_contact_date: optionalDate(lead.first_contact_date, `master-sheet row ${index + 1} first_contact_date`),
      last_action: optionalString(lead.last_action),
      last_action_date: optionalTimestamp(lead.last_action_date, `master-sheet row ${index + 1} last_action_date`),
      follow_up_count: optionalNumber(lead.follow_up_count, `master-sheet row ${index + 1} follow_up_count`) ?? 0,
      notes: optionalString(lead.notes),
      client_tier: optionalString(lead.client_tier),
      client_product: optionalString(lead.client_product),
      client_amount: clientAmount,
      client_start_date: optionalDate(lead.client_start_date, `master-sheet row ${index + 1} client_start_date`),
      client_status: optionalString(lead.client_status),
      metadata,
    }
  })
  assertUnique(leads, 'id', 'data/master-sheet.json')
  return leads
}

async function loadEvents(): Promise<JsonRecord[]> {
  const lines = (await fs.readFile(path.join(dataDir, 'agent-events.jsonl'), 'utf8')).split(/\r?\n/)
  const events: JsonRecord[] = []

  lines.forEach((line, index) => {
    if (line.trim() === '') return
    let source: JsonRecord
    try {
      source = asRecord(JSON.parse(line), `agent-events line ${index + 1}`)
    } catch (error) {
      throw new Error(`Could not parse agent-events line ${index + 1}: ${(error as Error).message}`)
    }
    events.push({
      ts: optionalTimestamp(source.ts, `agent-events line ${index + 1} ts`),
      agent_name: optionalString(source.from),
      event_type: optionalString(source.type),
      data: source.payload ?? {},
    })
  })

  return events
}

async function walkMarkdown(directory: string): Promise<string[]> {
  let entries
  try {
    entries = await fs.readdir(directory, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }

  const nested = await Promise.all(
    entries.map((entry) => {
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) return walkMarkdown(fullPath)
      return entry.isFile() && entry.name.endsWith('.md') ? [fullPath] : []
    }),
  )
  return nested.flat().sort()
}

async function loadReports(): Promise<JsonRecord[]> {
  const reportsDir = path.join(dataDir, 'reports')
  const files = await walkMarkdown(reportsDir)

  const reports = await Promise.all(
    files.map(async (file) => {
      const relative = path.relative(reportsDir, file)
      const filename = path.basename(file)
      const category = relative.split(path.sep)[0] || 'daily'
      const match = filename.match(/^(\d{4}-\d{2}-\d{2})-(.+)\.md$/)
      return {
        filename,
        category,
        report_date: match?.[1] ?? null,
        report_type: match?.[2] ?? null,
        content: await fs.readFile(file, 'utf8'),
      }
    }),
  )
  assertUnique(reports, 'filename', 'data/reports')
  return reports
}

async function loadCalls(): Promise<JsonRecord> {
  const payload = asRecord(
    JSON.parse(await fs.readFile(path.join(dataDir, 'today-calls.json'), 'utf8')),
    'data/today-calls.json',
  )
  return {
    id: 1,
    payload,
    generated_at: optionalTimestamp(payload.generated_at, 'today-calls generated_at'),
  }
}

async function loadMigrationData(): Promise<MigrationData> {
  const [leads, events, reports, calls] = await Promise.all([
    loadLeads(),
    loadEvents(),
    loadReports(),
    loadCalls(),
  ])
  return { leads, events, reports, calls }
}

async function upsertBatches(
  supabase: SupabaseClient,
  table: string,
  rows: JsonRecord[],
  onConflict: string,
): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const { error } = await supabase
      .from(table)
      .upsert(rows.slice(offset, offset + BATCH_SIZE), { onConflict })
    if (error) throw new Error(`${table} batch ${offset / BATCH_SIZE + 1} failed: ${error.message}`)
  }
}

async function eventsMissingFromDatabase(
  supabase: SupabaseClient,
  sourceEvents: JsonRecord[],
): Promise<JsonRecord[]> {
  const existingCounts = new Map<string, number>()

  for (let offset = 0; ; offset += BATCH_SIZE) {
    const { data, error } = await supabase
      .from('agent_events')
      .select('ts,agent_name,event_type,data')
      .order('id', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1)
    if (error) throw new Error(`agent_events read failed: ${error.message}`)
    for (const event of data ?? []) {
      const fingerprint = eventFingerprint(event)
      existingCounts.set(fingerprint, (existingCounts.get(fingerprint) ?? 0) + 1)
    }
    if (!data || data.length < BATCH_SIZE) break
  }

  return sourceEvents.filter((event) => {
    const fingerprint = eventFingerprint(event)
    const remaining = existingCounts.get(fingerprint) ?? 0
    if (remaining === 0) return true
    existingCounts.set(fingerprint, remaining - 1)
    return false
  })
}

async function migrate(data: MigrationData): Promise<void> {
  const url = process.env.SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required with --apply')
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  await upsertBatches(supabase, 'leads', data.leads, 'id')
  const newEvents = await eventsMissingFromDatabase(supabase, data.events)
  for (let offset = 0; offset < newEvents.length; offset += BATCH_SIZE) {
    const { error } = await supabase.from('agent_events').insert(newEvents.slice(offset, offset + BATCH_SIZE))
    if (error) throw new Error(`agent_events batch ${offset / BATCH_SIZE + 1} failed: ${error.message}`)
  }
  await upsertBatches(supabase, 'reports', data.reports, 'filename')

  const { error } = await supabase.from('calls_cache').upsert(data.calls, { onConflict: 'id' })
  if (error) throw new Error(`calls_cache upsert failed: ${error.message}`)

  console.log(`Applied migration: ${data.leads.length} leads, ${newEvents.length} new agent events, ${data.reports.length} reports, 1 calls cache row.`)
}

async function importBatches(
  apiUrl: string,
  apiSecret: string,
  resource: 'leads' | 'events' | 'reports' | 'calls',
  rows: JsonRecord[],
  replace = false,
): Promise<void> {
  const batches = rows.length ? Array.from({ length: Math.ceil(rows.length / BATCH_SIZE) }, (_, index) =>
    rows.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE)) : [[]]
  for (let index = 0; index < batches.length; index++) {
    const response = await fetch(`${apiUrl}/api/admin/import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        resource,
        records: batches[index],
        replace: replace && index === 0,
      }),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string }
      throw new Error(`${resource} batch ${index + 1} failed: ${body.error || `HTTP ${response.status}`}`)
    }
  }
}

async function migrateViaApi(data: MigrationData): Promise<void> {
  const apiUrl = (process.env.MIGRATION_API_URL || '').trim().replace(/\/+$/, '')
  const apiSecret = (process.env.API_SECRET || '').trim()
  if (!apiUrl || !apiSecret) {
    throw new Error('MIGRATION_API_URL and API_SECRET are required for API migration')
  }
  const parsed = new URL(apiUrl)
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
    throw new Error('MIGRATION_API_URL must use HTTPS')
  }
  await importBatches(apiUrl, apiSecret, 'leads', data.leads, true)
  await importBatches(apiUrl, apiSecret, 'events', data.events, true)
  await importBatches(apiUrl, apiSecret, 'reports', data.reports, true)
  await importBatches(apiUrl, apiSecret, 'calls', [data.calls])
  console.log(`Applied API migration: ${data.leads.length} leads, ${data.events.length} agent events, ${data.reports.length} reports, 1 calls cache row.`)
}

async function main(): Promise<void> {
  const data = await loadMigrationData()
  if (!apply) {
    console.log('Dry run only; no database connection or writes were attempted.')
    console.log(`Would process ${data.leads.length} leads, ${data.events.length} agent events, ${data.reports.length} reports, and 1 calls cache row.`)
    console.log('Run with --apply to write to Supabase.')
    return
  }
  if (process.env.MIGRATION_API_URL) await migrateViaApi(data)
  else await migrate(data)
}

function redactSecrets(message: string): string {
  const secretValues = Object.entries(process.env)
    .filter(([name, value]) => value && /(SECRET|TOKEN|PASSWORD|SERVICE_ROLE_KEY|API_KEY)/i.test(name))
    .map(([, value]) => value as string)
    .sort((left, right) => right.length - left.length)
  return secretValues.reduce(
    (redacted, secret) => redacted.split(secret).join('[REDACTED]'),
    message,
  )
}

main().catch((error) => {
  console.error(`Migration failed: ${redactSecrets((error as Error).message)}`)
  process.exitCode = 1
})
