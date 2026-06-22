import fs from 'fs'
import path from 'path'

export function readJSON(dataDir: string, file: string) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf-8'))
  } catch { return null }
}

export function writeJSON(dataDir: string, file: string, data: any) {
  // Atomic write: write to a temp file then rename, so a crash mid-write
  // can never leave a half-written (corrupt) JSON file on disk.
  const full = path.join(dataDir, file)
  const tmp = `${full}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, full)
}

// YYYY-MM-DD for a Date in a specific IANA timezone (en-CA yields ISO date order).
export function localDateStr(d: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

// Date portion of a calendar/event start string, interpreted in the given timezone.
// Date-only values ("2026-06-18") are taken as-is; full datetimes are converted.
export function eventDateStr(start: string, timezone: string): string {
  if (!start) return ''
  return start.length <= 10 ? start.slice(0, 10) : localDateStr(new Date(start), timezone)
}

export function readJSONL(dataDir: string, file: string) {
  try {
    const content = fs.readFileSync(path.join(dataDir, file), 'utf-8').trim()
    if (!content) return []
    return content.split('\n').map(line => {
      try { return JSON.parse(line) } catch { return null }
    }).filter(Boolean)
  } catch { return [] }
}

export function readMasterSheet(dataDir: string): any[] {
  return readJSON(dataDir, 'master-sheet.json') || []
}

export function writeMasterSheet(dataDir: string, data: any[]) {
  writeJSON(dataDir, 'master-sheet.json', data)
}

export function readLead(dataDir: string, id: string): any | null {
  return readJSON(dataDir, path.join('leads', `${id}.json`))
}

export function writeLead(dataDir: string, id: string, data: any) {
  writeJSON(dataDir, path.join('leads', `${id}.json`), data)
}

export function updateLead(dataDir: string, id: string, updates: any) {
  const master = readMasterSheet(dataDir)
  const idx = master.findIndex((l: any) => l.id === id)
  if (idx === -1) return null

  master[idx] = { ...master[idx], ...updates, last_action_date: new Date().toISOString() }
  writeMasterSheet(dataDir, master)

  const full = readLead(dataDir, id)
  if (full) writeLead(dataDir, id, { ...full, ...updates })

  return master[idx]
}

export function findLeadByEmail(dataDir: string, email: string): any | null {
  if (!email) return null
  const master = readMasterSheet(dataDir)
  return master.find((l: any) => l.email?.toLowerCase() === email.toLowerCase()) || null
}

export function findLeadByPhone(dataDir: string, phone: string): any | null {
  if (!phone) return null
  const master = readMasterSheet(dataDir)
  const digits = phone.replace(/\D/g, '')
  return master.find((l: any) => l.phone?.replace(/\D/g, '') === digits) || null
}

export function createLead(dataDir: string, lead: any): any {
  const master = readMasterSheet(dataDir)
  // Derive the next id from the highest existing lead-NNN, not array length —
  // length+1 collides (and silently overwrites) whenever ids have gaps.
  const maxNum = master.reduce((max: number, l: any) => {
    const m = /^lead-(\d+)$/.exec(l.id || '')
    return m ? Math.max(max, parseInt(m[1], 10)) : max
  }, 0)
  const id = lead.id || `lead-${String(maxNum + 1).padStart(3, '0')}`
  const record = {
    id,
    type: 'lead',
    score: 'BASIC',
    status: 'new',
    follow_up_count: 0,
    first_contact_date: new Date().toISOString(),
    last_action_date: new Date().toISOString(),
    ...lead,
  }
  master.push(record)
  writeMasterSheet(dataDir, master)
  writeLead(dataDir, id, record)
  return record
}
