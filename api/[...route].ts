// @ts-nocheck — runtime-tested serverless handler; skip strict type-check at build
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'node:crypto'
import Stripe from 'stripe'

const AGENT_SCHEDULES = [
  { id:'gc-lead-intake', name:'Lead Intake & Scoring', cron:'*/30 9-18 * * 1-5', description:'Monitors Gmail for new leads and scores them HOT/WARM/BASIC' },
  { id:'gc-email-responder', name:'Email Responder & Follow-Up', cron:'32 9-17 * * 1-5', description:'Drafts first-touch emails and monitors replies' },
  { id:'gc-appointment-setter', name:'Appointment Setter', cron:'57 9,11,13,15,17 * * 1-5', description:'Sends Calendly links, confirmations, reminders, and pre-call briefings' },
  { id:'gc-post-call', name:'Post-Call & Proposal', cron:'50 9-17 * * 1-5', description:'Pulls Fireflies transcripts and drafts follow-ups/proposals' },
  { id:'gc-crm-morning', name:'CRM Morning Briefing', cron:'7 7 * * 1-5', description:'Generates morning pipeline report and action plan' },
  { id:'gc-qa-health', name:'QA & System Health', cron:'23 7 * * 1-5', description:'Validates data cleanliness and agent health' },
  { id:'gc-crm-evening', name:'CRM Evening Reconciliation', cron:'39 17 * * 1-5', description:'End-of-day wrap-up and uncalled HOT leads list' },
] as const
const AGENTS = AGENT_SCHEDULES.map(agent => agent.id)
const PROPOSAL_KEYWORDS = ['proposal sent','proposal delivered','pricing sent','engagement letter','sent proposal','sent pricing','payment link']
const STARTED_AT = Date.now()
const SESSION_COOKIE = 'mindy_session'
const SESSION_TTL_SECONDS = 12 * 60 * 60

// ── Supabase client (inlined; no relative imports to keep ESM happy) ──
const SUPA_URL = (process.env.SUPABASE_URL || '').trim()
const SUPA_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
let initError: string | null = null
let supabase: any = null
if (SUPA_URL && SUPA_KEY) {
  try {
    supabase = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } })
  } catch (err: any) {
    initError = err?.message || String(err)
  }
}
const supabaseReady = !!(SUPA_URL && SUPA_KEY) && !initError

function cleanOrigin(value: string) {
  return value.replace(/\/+$/, '')
}

function requestOrigin(req: VercelRequest) {
  const protoHeader = req.headers['x-forwarded-proto']
  const hostHeader = req.headers['x-forwarded-host'] || req.headers.host
  const proto = (Array.isArray(protoHeader) ? protoHeader[0] : protoHeader || 'https').split(',')[0].trim()
  const host = (Array.isArray(hostHeader) ? hostHeader[0] : hostHeader || '').split(',')[0].trim()
  return host ? `${proto}://${host}` : ''
}

function setCors(req: VercelRequest, res: VercelResponse) {
  const originHeader = req.headers.origin
  const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader
  if (!origin) return true

  const configured = cleanOrigin((process.env.APP_ORIGIN || '').trim())
  const sameDeployment = cleanOrigin(requestOrigin(req))
  const allowed = [configured, sameDeployment].filter(Boolean).includes(cleanOrigin(origin))
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  return allowed
}

function secretsMatch(provided: string, expected: string) {
  const providedBuffer = Buffer.from(provided)
  const expectedBuffer = Buffer.from(expected)
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer)
}

function parseCookies(req: VercelRequest) {
  const header = req.headers.cookie || ''
  return Object.fromEntries(header.split(';').map(part => {
    const [key, ...value] = part.trim().split('=')
    return [key, decodeURIComponent(value.join('='))]
  }).filter(([key]) => key))
}

function sessionSignature(expires: string) {
  const secret = (process.env.API_SECRET || '').trim()
  return secret ? createHmac('sha256', secret).update(expires).digest('hex') : ''
}

function hasValidSession(req: VercelRequest) {
  const token = parseCookies(req)[SESSION_COOKIE]
  if (!token) return false
  const [expires, signature] = token.split('.')
  if (!expires || !signature || Number(expires) <= Date.now()) return false
  return secretsMatch(signature, sessionSignature(expires))
}

function hasValidBearer(req: VercelRequest) {
  const secret = (process.env.API_SECRET || '').trim()
  if (!secret) return false
  const authorization = req.headers.authorization
  const value = Array.isArray(authorization) ? authorization[0] : authorization || ''
  const match = value.match(/^Bearer\s+(.+)$/i)
  return !!match && secretsMatch(match[1], secret)
}

function isAuthorized(req: VercelRequest) {
  return hasValidSession(req) || hasValidBearer(req)
}

function authorizeMutation(req: VercelRequest, res: VercelResponse) {
  const secret = (process.env.API_SECRET || '').trim()
  if (!secret) {
    res.status(503).json({ error:'Mutation authorization is not configured' })
    return false
  }
  if (!isAuthorized(req)) {
    res.setHeader('WWW-Authenticate', 'Bearer')
    res.status(401).json({ error:'Unauthorized' })
    return false
  }
  return true
}

function normalizeEvent(row: any) {
  const stored = row?.data && typeof row.data === 'object' ? row.data : {}
  return {
    ts: row.ts || row.created_at,
    from: row.agent_name || stored.from || 'unknown',
    to: stored.to || 'system',
    type: row.event_type || stored.type || 'unknown',
    ...(stored.lead_id && { lead_id: stored.lead_id }),
    payload: stored.payload !== undefined ? stored.payload : stored,
  }
}

function isAgentTrigger(path: string, method: string) {
  return method === 'POST' && (path === 'agents/run-all' || /^agents\/[^/]+\/run$/.test(path))
}

function isStaticRoute(path: string, method: string) {
  return path === 'health' || (path === 'agents' && method === 'GET') || isAgentTrigger(path, method)
}

async function proxyAgentTrigger(path: string, req: VercelRequest, res: VercelResponse) {
  const configuredUrl = (process.env.AGENT_WORKER_URL || '').trim()
  if (!configuredUrl) {
    return res.status(501).json({ error:'Agent execution is unavailable in this deployment; configure AGENT_WORKER_URL' })
  }

  let target: URL
  try {
    target = new URL(configuredUrl)
    if (target.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && target.protocol === 'http:')) throw new Error('Unsafe protocol')
    target.username = ''
    target.password = ''
    target.pathname = `${target.pathname.replace(/\/+$/, '')}/api/${path}`
    target.search = ''
    target.hash = ''
  } catch {
    return res.status(503).json({ error:'Agent worker is not configured correctly' })
  }

  const workerSecret = (process.env.AGENT_WORKER_SECRET || process.env.API_SECRET || '').trim()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetch(target, {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':`Bearer ${workerSecret}`,
      },
      body:JSON.stringify(req.body || {}),
      signal:controller.signal,
    })
    const body = await response.text()
    const contentType = response.headers.get('content-type')
    if (contentType) res.setHeader('Content-Type', contentType)
    return res.status(response.status).send(body)
  } catch (error:any) {
    const timedOut = error?.name === 'AbortError'
    return res.status(timedOut ? 504 : 502).json({ error:timedOut ? 'Agent worker timed out' : 'Agent worker unavailable' })
  } finally {
    clearTimeout(timeout)
  }
}

// ── Stripe helpers (inlined) ──
const CACHE_TTL_MS = 30 * 60 * 1000
function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  return new Stripe(key, { telemetry: false })
}
async function fetchAllCharges(since: Date): Promise<any[]> {
  const stripe = getStripe()
  if (!stripe) return []
  const { data: cached } = await supabase.from('stripe_cache').select('data, fetched_at').eq('id', 1).maybeSingle()
  if (cached && (Date.now() - new Date(cached.fetched_at).getTime()) < CACHE_TTL_MS) {
    const cutoff = Math.floor(since.getTime() / 1000)
    return (cached.data as any[]).filter((c: any) => c.created >= cutoff)
  }
  const twelveMonthsAgo = new Date(); twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
  const allCharges: any[] = []
  let hasMore = true, startingAfter: string | undefined
  while (hasMore) {
    const params: any = { limit: 100, created: { gte: Math.floor(twelveMonthsAgo.getTime() / 1000) } }
    if (startingAfter) params.starting_after = startingAfter
    const batch = await stripe.charges.list(params)
    allCharges.push(...batch.data.filter((c: any) => c.status === 'succeeded'))
    hasMore = batch.has_more
    if (batch.data.length > 0) startingAfter = batch.data[batch.data.length - 1].id
  }
  await supabase.from('stripe_cache').upsert({ id: 1, data: allCharges, fetched_at: new Date().toISOString() })
  const cutoff = Math.floor(since.getTime() / 1000)
  return allCharges.filter((c: any) => c.created >= cutoff)
}
// A refunded charge KEEPS status 'succeeded' in Stripe; the refund surfaces as
// amount_refunded. Every revenue figure has to net it out, or refunds stay
// invisible and reported revenue overstates by the refunded amount.
function netAmountCents(c: any) {
  return Math.max(0, (c?.amount || 0) - (c?.amount_refunded || 0))
}
function netAmount(c: any) {
  return netAmountCents(c) / 100
}

function matchStripeToLead(email: string, name: string, leads: any[]): any | null {
  if (!email && !name) return null
  const e = (email || '').toLowerCase(), n = (name || '').toLowerCase()
  return leads.find((l: any) => (e && l.email && l.email.toLowerCase() === e) || (n && l.name && l.name.toLowerCase() === n)) || null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Vary', 'Origin')
  if (!setCors(req, res)) return res.status(403).json({ error:'Origin not allowed' })
  if (req.method === 'OPTIONS') return res.status(204).end()

  // Derive the route from the URL itself (robust across Vercel param shapes)
  const rawRoute = req.query.route
  let slug: string[]
  if (Array.isArray(rawRoute)) slug = rawRoute
  else if (typeof rawRoute === 'string' && rawRoute) slug = rawRoute.split('/')
  else {
    // Fall back to parsing the request URL
    const urlPath = (req.url || '').split('?')[0].replace(/^\/api\/?/, '')
    slug = urlPath ? urlPath.split('/') : []
  }
  const path = slug.join('/')
  const method = req.method || 'GET'

  if (path === 'session' && method === 'GET') {
    const configured = !!(process.env.DASHBOARD_PASSWORD || '').trim()
    // Auth is always required now. When it isn't configured the API is locked,
    // so report "not authenticated" and let the login screen explain why.
    return res.json({ authenticated: configured && isAuthorized(req), authRequired: true, configured })
  }

  if (path === 'login' && method === 'POST') {
    const password = (process.env.DASHBOARD_PASSWORD || '').trim()
    const secret = (process.env.API_SECRET || '').trim()
    if (!password || !secret) return res.status(503).json({ error:'Dashboard authentication is not configured' })
    const provided = typeof req.body?.password === 'string' ? req.body.password : ''
    if (!secretsMatch(provided, password)) return res.status(401).json({ error:'Invalid password' })
    const expires = String(Date.now() + SESSION_TTL_SECONDS * 1000)
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${expires}.${sessionSignature(expires)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`)
    return res.json({ authenticated:true })
  }

  if (path === 'logout' && method === 'POST') {
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
    return res.json({ authenticated:false })
  }

  // Keep health output intentionally generic: never expose config names, values, or errors.
  if (path === 'health') {
    if (!supabaseReady) {
      return res.status(503).json({ status:'degraded', database:'unavailable' })
    }
    try {
      const { error } = await supabase.from('leads').select('id').limit(1)
      if (error) return res.status(503).json({ status:'degraded', database:'unavailable' })
      return res.json({ status:'ok', database:'connected' })
    } catch {
      return res.status(503).json({ status:'degraded', database:'unavailable' })
    }
  }

  // Fail CLOSED: if DASHBOARD_PASSWORD is ever unset, renamed, or cleared during
  // an env edit, this must lock the API rather than silently serving the whole
  // CRM to anyone with the URL.
  if (!(process.env.DASHBOARD_PASSWORD || '').trim()) {
    return res.status(503).json({
      error:'API locked: DASHBOARD_PASSWORD is not set on the server.',
      hint:'Set DASHBOARD_PASSWORD (and API_SECRET) in the Vercel project environment variables, then redeploy.'
    })
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ error:'Authentication required' })
  }

  // Static agent metadata does not require database connectivity.
  if (path === 'agents' && method === 'GET') {
    return res.json(AGENT_SCHEDULES)
  }

  // Vercel functions must delegate agent execution to a durable worker.
  if (isAgentTrigger(path, method)) {
    if (!authorizeMutation(req, res)) return
    const agentId = slug[1]
    if (path !== 'agents/run-all' && !AGENTS.includes(agentId as any)) {
      return res.status(404).json({ error:'Agent not found' })
    }
    return proxyAgentTrigger(path, req, res)
  }

  const mutationRequiresAuth =
    (method === 'PATCH' && slug[0] === 'leads' && slug.length === 2) ||
    (method === 'POST' && path === 'stripe-crossref/upgrade') ||
    (method === 'POST' && path === 'seed-from-stripe') ||
    (method === 'POST' && path === 'refund') ||
    (method === 'POST' && path === 'admin/import')
  if (mutationRequiresAuth && !authorizeMutation(req, res)) return

  // Every remaining implemented route reads or writes Supabase.
  if (!isStaticRoute(path, method) && !supabaseReady) {
    return res.status(503).json({ error:'Data service unavailable' })
  }

  try {
    // POST /api/admin/import — protected migration bridge for local JSON data.
    if (path === 'admin/import' && method === 'POST') {
      if (!hasValidBearer(req)) return res.status(401).json({ error:'Bearer authorization required' })
      const resource = req.body?.resource
      const records = req.body?.records
      if (!['leads','reports','events','calls'].includes(resource) || !Array.isArray(records) || records.length > 500) {
        return res.status(400).json({ error:'Invalid migration payload' })
      }
      if (resource === 'leads') {
        if (req.body?.replace === true) {
          const { error } = await supabase.from('leads').delete().neq('id', '__migration_never__')
          if (error) throw error
        }
        const { error } = await supabase.from('leads').upsert(records, { onConflict:'id' })
        if (error) throw error
      } else if (resource === 'reports') {
        if (req.body?.replace === true) {
          const { error } = await supabase.from('reports').delete().neq('filename', '__migration_never__')
          if (error) throw error
        }
        const { error } = await supabase.from('reports').upsert(records, { onConflict:'filename' })
        if (error) throw error
      } else if (resource === 'calls') {
        const { error } = await supabase.from('calls_cache').upsert(records, { onConflict:'id' })
        if (error) throw error
      } else {
        if (req.body?.replace === true) {
          const { error } = await supabase.from('agent_events').delete().gte('id', 0)
          if (error) throw error
        }
        if (records.length) {
          const { error } = await supabase.from('agent_events').insert(records)
          if (error) throw error
        }
      }
      return res.json({ ok:true, resource, processed:records.length })
    }

    // GET /api/stats
    if (path === 'stats') {
      const [{ data: all, error }, { data: events }] = await Promise.all([
        supabase.from('leads').select('*'),
        supabase.from('agent_events').select('agent_name,event_type,ts').eq('event_type','run_summary').order('ts',{ascending:false})
      ])
      if (error) throw error
      const leads = (all||[]).filter((l:any) => l.type !== 'client')
      const clients = (all||[]).filter((l:any) => l.type === 'client')
      const byScore:Record<string,number> = {}, byStatus:Record<string,number> = {}
      for (const l of leads) {
        if (l.score) byScore[l.score] = (byScore[l.score]||0)+1
        if (l.status) byStatus[l.status] = (byStatus[l.status]||0)+1
      }
      const clientsByTier:Record<string,number> = {}, clientsByStatus:Record<string,number> = {}
      for (const c of clients) {
        const tier = c.client_tier||'unknown', cs = c.client_status||'active'
        clientsByTier[tier] = (clientsByTier[tier]||0)+1
        clientsByStatus[cs] = (clientsByStatus[cs]||0)+1
      }
      const now = Date.now(), todayStr = new Date().toDateString()
      const agentHealth:Record<string,any> = {}
      for (const agent of AGENTS) {
        const runs = (events||[]).filter((e:any) => e.agent_name === agent)
        const last = runs[0]
        agentHealth[agent] = { lastRun: last?.ts||null, runsToday: runs.filter((e:any) => new Date(e.ts).toDateString()===todayStr).length, status: last?(now-new Date(last.ts).getTime()<86400000?'ok':'stale'):'never' }
      }
      const proposalsOut = (all||[]).filter((l:any) => l.status==='proposal_sent'||PROPOSAL_KEYWORDS.some(kw=>((l.last_action||'')+' '+(l.notes||'')).toLowerCase().includes(kw))).length
      return res.json({ total:(all||[]).length, totalLeads:leads.length, totalClients:clients.length, byScore, byStatus, clientsByTier, clientsByStatus, agentHealth, proposalsOut, recentLeads:leads.filter((l:any)=>l.status!=='paid').slice(-5).reverse(), recentClients:clients.slice(-5).reverse() })
    }

    // GET /api/leads-only
    if (path === 'leads-only') {
      const { data, error } = await supabase.from('leads').select('*').neq('type','client').order('created_at',{ascending:false})
      if (error) throw error
      return res.json(data||[])
    }

    // GET /api/clients
    if (path === 'clients') {
      const { data, error } = await supabase.from('leads').select('*').eq('type','client').order('created_at',{ascending:false})
      if (error) throw error
      return res.json(data||[])
    }

    // GET /api/leads
    if (path === 'leads' && method === 'GET') {
      const { data, error } = await supabase.from('leads').select('*').order('created_at',{ascending:false})
      if (error) throw error
      return res.json(data||[])
    }

    // GET/PATCH /api/leads/:id
    if (slug[0]==='leads' && slug[1] && slug.length===2) {
      const id = slug[1]
      if (method === 'GET') {
        const { data, error } = await supabase.from('leads').select('*').eq('id',id).maybeSingle()
        if (error || !data) return res.status(404).json({ error:'Lead not found' })
        return res.json(data)
      }
      if (method === 'PATCH') {
        const { data, error } = await supabase.from('leads').update({...req.body, last_action_date:new Date().toISOString()}).eq('id',id).select().maybeSingle()
        if (error || !data) return res.status(404).json({ error:'Lead not found' })
        return res.json(data)
      }
    }

    // GET /api/calls
    if (path === 'calls') {
      const { data } = await supabase.from('calls_cache').select('payload').eq('id',1).maybeSingle()
      return res.json(data?.payload||{today:[],tomorrow:[],this_week:[],generated_at:null})
    }

    // GET /api/events
    if (path === 'events') {
      const hours = Number(req.query.hours)||24
      const cutoff = new Date(Date.now()-hours*3600000).toISOString()
      const { data, error } = await supabase.from('agent_events').select('*').gte('ts',cutoff).order('ts',{ascending:false}).limit(200)
      if (error) throw error
      return res.json((data||[]).map(normalizeEvent))
    }

    // GET /api/command-center
    if (path === 'command-center' && method === 'GET') {
      const cutoff = new Date(Date.now()-24*3600000).toISOString()
      const { data, error } = await supabase.from('agent_events').select('*').order('ts',{ascending:false}).limit(1000)
      if (error) throw error
      const events = (data||[]).map(normalizeEvent)
      const agents = AGENT_SCHEDULES.map(schedule => {
        const agentEvents = events.filter((event:any) => event.from === schedule.id)
        const lastEvent = agentEvents[0]
        const lastSummary = agentEvents.find((event:any) => event.type === 'run_summary')
        const runsLast24h = agentEvents.filter((event:any) => event.type === 'run_summary' && event.ts >= cutoff).length
        const summaryHasErrors = Array.isArray(lastSummary?.payload?.errors) && lastSummary.payload.errors.length > 0
        const latestIsError = ['error','run_error','failed'].includes(lastEvent?.type)
        let status:'idle'|'running'|'error'|'offline' = 'idle'
        if (lastEvent?.type === 'run_start') status = 'running'
        else if (summaryHasErrors || lastSummary?.payload?.success === false || latestIsError) status = 'error'
        else if (!lastEvent) status = 'offline'
        return {
          ...schedule,
          lastRun:lastSummary?.ts||lastEvent?.ts||null,
          lastSummary:lastSummary?.payload||null,
          runsLast24h,
          status,
        }
      })
      const googleConfigured = !!process.env.GMAIL_SERVICE_ACCOUNT_JSON ||
        !!(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN)
      return res.json({
        agents,
        recentEvents:events.slice(0,50),
        system:{
          uptime:Math.max(0,(Date.now()-STARTED_AT)/1000),
          timezone:process.env.SCHEDULER_TIMEZONE||'America/New_York',
          serverTime:new Date().toISOString(),
          integrations:{
            stripe:!!process.env.STRIPE_SECRET_KEY,
            slack:!!process.env.SLACK_BOT_TOKEN,
            gmail:googleConfigured,
            calendar:googleConfigured,
            fireflies:!!process.env.FIREFLIES_API_KEY,
            openai:!!process.env.OPENAI_API_KEY,
          },
        },
      })
    }

    // GET /api/reports
    if (path === 'reports') {
      const { data, error } = await supabase.from('reports').select('filename,category').order('filename',{ascending:false})
      if (error) throw error
      return res.json({ daily:(data||[]).filter((r:any)=>r.category==='daily').map((r:any)=>r.filename), weekly:(data||[]).filter((r:any)=>r.category==='weekly').map((r:any)=>r.filename) })
    }

    // GET /api/reports/:type
    if (slug[0]==='reports' && slug[1]) {
      const type = slug[1], date = (req.query.date as string)||new Date().toISOString().slice(0,10)
      const { data, error } = await supabase.from('reports').select('content').eq('filename',`${date}-${type}.md`).maybeSingle()
      if (error||!data) return res.status(404).json({ error:'Report not found' })
      return res.json({ date, type, content:data.content })
    }

    // GET /api/revenue
    if (path === 'revenue') {
      if (!getStripe()) return res.json({ enabled:false })
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(),now.getMonth(),1)
      const startOfLastMonth = new Date(now.getFullYear(),now.getMonth()-1,1)
      const twelveMonthsAgo = new Date(now.getFullYear(),now.getMonth()-12,1)
      const [allCharges,{data:allLeads}] = await Promise.all([fetchAllCharges(twelveMonthsAgo),supabase.from('leads').select('id,name,email,type,score,client_tier')])
      const monthlyRevenue:Record<string,{revenue:number;count:number}> = {}
      for (const c of allCharges) {
        const d = new Date(c.created*1000), key = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')
        if (!monthlyRevenue[key]) monthlyRevenue[key] = {revenue:0,count:0}
        monthlyRevenue[key].revenue += netAmount(c); monthlyRevenue[key].count++
      }
      const thisMonthKey = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')
      const lastMonthKey = startOfLastMonth.getFullYear()+'-'+String(startOfLastMonth.getMonth()+1).padStart(2,'0')
      const thisMonth = monthlyRevenue[thisMonthKey]?.revenue||0, lastMonth = monthlyRevenue[lastMonthKey]?.revenue||0
      const ytd = Object.entries(monthlyRevenue).filter(([k])=>k>=now.getFullYear()+'-01').reduce((s,[,v])=>s+v.revenue,0)
      const thisMonthCharges = allCharges.filter(c=>c.created>=Math.floor(startOfMonth.getTime()/1000))
      const dailyRevenue:Record<string,number> = {}
      for (const c of thisMonthCharges) { const day=new Date(c.created*1000).toISOString().slice(0,10); dailyRevenue[day]=(dailyRevenue[day]||0)+netAmount(c) }
      const recentTransactions = allCharges.slice(0,30).map((c:any) => { const email=c.billing_details?.email||c.receipt_email||'', name=c.billing_details?.name||'', match=matchStripeToLead(email,name,allLeads||[]); return {id:c.id,amount:netAmount(c),gross_amount:(c.amount||0)/100,amount_refunded:(c.amount_refunded||0)/100,refunded:!!c.refunded,refundable:netAmount(c),currency:c.currency,description:c.description||c.metadata?.product||'Payment',customer_email:email,customer_name:name,date:new Date(c.created*1000).toISOString(),status:c.status,client_match:match?{id:match.id,name:match.name,type:match.type,score:match.score,client_tier:match.client_tier}:null,platform:c.metadata?.platform||null} })
      const productGroups:Record<string,{name:string;count:number;total:number;customers:string[]}> = {}
      for (const c of allCharges) { const rawDesc=c.description||c.metadata?.memberpress_product||c.metadata?.product||'Other'; let group=rawDesc; if(/subscription (update|creation)/i.test(rawDesc))group='Mighty Networks / Subscription'; else if(/ai tools.*crm.*research/i.test(rawDesc))group='AI Tools + CRM + Research'; else if(/ai tools/i.test(rawDesc))group='AI Tools'; if(!productGroups[group])productGroups[group]={name:group,count:0,total:0,customers:[]}; productGroups[group].count++; productGroups[group].total+=netAmount(c); const cn=c.billing_details?.name||c.receipt_email||'Unknown'; if(!productGroups[group].customers.includes(cn))productGroups[group].customers.push(cn) }
      const mom = lastMonth>0?((thisMonth-lastMonth)/lastMonth*100).toFixed(1):null
      return res.json({ enabled:true,thisMonth,lastMonth,ytd,transactionCount:thisMonthCharges.length,totalCharges:allCharges.length,recentTransactions,dailyRevenue,monthlyRevenue:Object.entries(monthlyRevenue).sort().map(([month,data])=>({month,...data})),productGroups:Object.values(productGroups).sort((a,b)=>b.total-a.total),monthOverMonth:mom })
    }

    // GET /api/revenue/report
    if (path === 'revenue/report') {
      const stripe = getStripe()
      if (!stripe) return res.json({ enabled:false })
      const now = new Date(), twelveMonthsAgo = new Date(now.getFullYear(),now.getMonth()-12,1)
      const [allCharges,activeSubs,{data:allLeads}] = await Promise.all([fetchAllCharges(twelveMonthsAgo),stripe.subscriptions.list({limit:100,status:'active'}),supabase.from('leads').select('id,name,email,type,client_tier,client_status')])
      const monthly:Record<string,{revenue:number;count:number}> = {}
      for (const c of allCharges) { const d=new Date(c.created*1000),key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); if(!monthly[key])monthly[key]={revenue:0,count:0}; monthly[key].revenue+=netAmount(c); monthly[key].count++ }
      let mrr=0; for (const s of activeSubs.data) { const item=s.items.data[0],amount=item?.price?.unit_amount?item.price.unit_amount/100:0,interval=item?.price?.recurring?.interval||'month'; mrr+=interval==='year'?amount/12:amount }
      const sortedMonths=Object.entries(monthly).sort(), currentMonth=sortedMonths[sortedMonths.length-1], prevMonth=sortedMonths[sortedMonths.length-2]
      const ytd=sortedMonths.filter(([k])=>k.startsWith(String(now.getFullYear()))).reduce((s,[,v])=>s+v.revenue,0)
      const customerTotals:Record<string,{name:string;email:string;total:number;count:number}> = {}
      for (const c of allCharges) { const email=c.billing_details?.email||c.receipt_email||'',name=c.billing_details?.name||email||'Unknown',key=email||name; if(!customerTotals[key])customerTotals[key]={name,email,total:0,count:0}; customerTotals[key].total+=netAmount(c); customerTotals[key].count++ }
      const topCustomers=Object.values(customerTotals).sort((a,b)=>b.total-a.total).slice(0,10)
      const growthData=sortedMonths.map(([month,data],i)=>({month,revenue:data.revenue,count:data.count,growth:i>0?((data.revenue-sortedMonths[i-1][1].revenue)/sortedMonths[i-1][1].revenue*100).toFixed(1)+'%':'N/A'}))
      return res.json({ enabled:true, report:{ generated:now.toISOString(), summary:{ thisMonth:currentMonth?{month:currentMonth[0],revenue:currentMonth[1].revenue,transactions:currentMonth[1].count}:null, lastMonth:prevMonth?{month:prevMonth[0],revenue:prevMonth[1].revenue,transactions:prevMonth[1].count}:null, ytd,mrr:Math.round(mrr*100)/100,activeSubscriptions:activeSubs.data.length,totalTransactions:allCharges.length,avgTransactionValue:allCharges.length>0?Math.round(allCharges.reduce((s,c)=>s+netAmount(c),0)/allCharges.length):0 }, monthlyTrend:growthData, topCustomers, clientMatches:topCustomers.map(tc=>{const match=matchStripeToLead(tc.email,tc.name,allLeads||[]);return{...tc,client_match:match?{name:match.name,type:match.type,tier:match.client_tier,status:match.client_status}:null}}) } })
    }

    // GET /api/subscriptions
    if (path === 'subscriptions') {
      const stripe = getStripe()
      if (!stripe) return res.json({ enabled:false })
      const [{data:allLeads},activeSubs,pastDueSubs] = await Promise.all([supabase.from('leads').select('id,name,email,type,client_tier'),stripe.subscriptions.list({limit:100,status:'active',expand:['data.customer']}),stripe.subscriptions.list({limit:100,status:'past_due',expand:['data.customer']})])
      const allSubs=[...activeSubs.data,...pastDueSubs.data]
      const productIds=[...new Set(allSubs.map(s=>s.items.data[0]?.price?.product as string).filter(Boolean))]
      const productNames:Record<string,string> = {}
      for (let i=0;i<productIds.length;i+=10) { await Promise.all(productIds.slice(i,i+10).map(async(pid)=>{try{const p=await stripe!.products.retrieve(pid);productNames[pid]=p.name}catch{productNames[pid]=pid}})) }
      const planGroups:Record<string,{name:string;price:number;interval:string;members:any[];mrr:number}> = {}
      let totalMrr=0
      const subscriptions=allSubs.map(s=>{
        const item=s.items.data[0],amount=item?.price?.unit_amount?item.price.unit_amount/100:0,interval=item?.price?.recurring?.interval||'month',prodId=item?.price?.product as string,productName=productNames[prodId]||prodId||'Unknown'
        let monthlyAmount=amount; if(interval==='year')monthlyAmount=amount/12; if(s.status==='active')totalMrr+=monthlyAmount
        const custObj=s.customer,custEmail=(typeof custObj==='object'&&custObj!==null&&!(custObj as any).deleted)?(custObj as any).email||'':'',custName=(typeof custObj==='object'&&custObj!==null&&!(custObj as any).deleted)?(custObj as any).name||'':''
        const match=matchStripeToLead(custEmail,custName,allLeads||[])
        let tierName:string,tierOrder:number
        if(amount===9){tierName='Community Plan';tierOrder=1}else if(amount===27){tierName='Starter Plan';tierOrder=2}else if(amount===99){tierName='Pro Member Group';tierOrder=3}else if(amount===249){tierName='Ongoing Coaching';tierOrder=4}else if(amount===497){tierName='Market Intelligence';tierOrder=5}else if(interval==='year'&&amount<=999){tierName='Pro Member (Annual)';tierOrder=6}else if(interval==='year'&&amount>999){tierName='Pro Member Lifetime';tierOrder=7}else if(amount>=4000){tierName='White Glove BD';tierOrder=8}else{tierName=productName;tierOrder=9}
        const groupKey=`${tierOrder}__${tierName}`
        if(!planGroups[groupKey])planGroups[groupKey]={name:tierName,price:amount,interval,members:[],mrr:0}
        planGroups[groupKey].members.push({name:custName||custEmail||s.id,email:custEmail,status:s.status,client_match:match?.name||null})
        if(s.status==='active')planGroups[groupKey].mrr+=monthlyAmount
        let periodEnd:string|null=null; try{const raw=(s as any).current_period_end;if(typeof raw==='number')periodEnd=new Date(raw*1000).toISOString()}catch{}
        return {id:s.id,customer_name:custName,customer_email:custEmail,status:s.status,amount,interval,product:productName,current_period_end:periodEnd,client_match:match?{id:match.id,name:match.name,type:match.type,client_tier:match.client_tier}:null}
      })
      return res.json({ enabled:true,mrr:Math.round(totalMrr*100)/100,activeCount:activeSubs.data.length,pastDueCount:pastDueSubs.data.length,subscriptions,planGroups:Object.entries(planGroups).sort(([a],[b])=>a.localeCompare(b)).map(([,v])=>v) })
    }

    // GET /api/stripe-crossref
    if (path === 'stripe-crossref') {
      if (!getStripe()) return res.json({ enabled:false })
      const now=new Date(),twelveMonthsAgo=new Date(now.getFullYear(),now.getMonth()-12,1)
      const [allCharges,{data:allLeads}]=await Promise.all([fetchAllCharges(twelveMonthsAgo),supabase.from('leads').select('id,name,email,type,score,status,client_tier')])
      const payers:Record<string,{name:string;email:string;total:number;count:number;lastPayment:string}> = {}
      for (const c of allCharges) { const email=(c.billing_details?.email||c.receipt_email||'').toLowerCase(),name=c.billing_details?.name||'',key=email||name.toLowerCase(); if(!key)continue; if(!payers[key])payers[key]={name,email,total:0,count:0,lastPayment:''}; payers[key].total+=netAmount(c); payers[key].count++; const dt=new Date(c.created*1000).toISOString(); if(dt>payers[key].lastPayment)payers[key].lastPayment=dt; if(name&&!payers[key].name)payers[key].name=name }
      const missingClients:any[]=[],matchedAsLead:any[]=[],matchedAsClient:any[]=[]
      for (const payer of Object.values(payers)) { const match=matchStripeToLead(payer.email,payer.name,allLeads||[]); if(!match)missingClients.push({...payer,status:'not_in_crm'}); else if(match.type!=='client')matchedAsLead.push({...payer,lead:{id:match.id,name:match.name,score:match.score,status:match.status}}); else matchedAsClient.push({...payer,client:{id:match.id,name:match.name,tier:match.client_tier}}) }
      return res.json({ enabled:true, summary:{totalPayers:Object.keys(payers).length,matchedAsClient:matchedAsClient.length,matchedAsLead:matchedAsLead.length,notInCrm:missingClients.length}, needsUpgrade:matchedAsLead.sort((a,b)=>b.total-a.total), missingFromCrm:missingClients.sort((a,b)=>b.total-a.total), confirmedClients:matchedAsClient.sort((a,b)=>b.total-a.total) })
    }

    // POST /api/stripe-crossref/upgrade
    if (path === 'stripe-crossref/upgrade' && method === 'POST') {
      const { leadIds } = req.body
      if (!leadIds?.length) return res.status(400).json({ error:'No leadIds provided' })
      const { data, error } = await supabase.from('leads').update({ type:'client',status:'paid',client_status:'active',last_action:'Upgraded to client via Stripe cross-reference',last_action_date:new Date().toISOString() }).in('id',leadIds).neq('type','client').select('id')
      if (error) throw error
      return res.json({ upgraded:(data||[]).length, total:leadIds.length })
    }

    // GET /api/transactions
    if (path === 'transactions') {
      if (!getStripe()) return res.json({ enabled:false })
      const now=new Date(),twelveMonthsAgo=new Date(now.getFullYear(),now.getMonth()-12,1)
      const [allCharges,{data:allLeads}]=await Promise.all([fetchAllCharges(twelveMonthsAgo),supabase.from('leads').select('id,name,email,type,score,client_tier,status')])
      const q=((req.query.q as string)||'').toLowerCase()
      const transactions=allCharges.map((c:any)=>{ const email=c.billing_details?.email||c.receipt_email||'',name=c.billing_details?.name||'',desc=c.description||c.metadata?.memberpress_product||c.metadata?.product||'',match=matchStripeToLead(email,name,allLeads||[]); return {id:c.id,amount:netAmount(c),gross_amount:(c.amount||0)/100,amount_refunded:(c.amount_refunded||0)/100,refunded:!!c.refunded,refundable:netAmount(c),currency:c.currency,description:desc,customer_email:email,customer_name:name,date:new Date(c.created*1000).toISOString(),client_match:match?{id:match.id,name:match.name,type:match.type,score:match.score,client_tier:match.client_tier,status:match.status}:null,platform:c.metadata?.platform||null} })
      const filtered=q?transactions.filter((t:any)=>t.customer_name.toLowerCase().includes(q)||t.customer_email.toLowerCase().includes(q)||t.description.toLowerCase().includes(q)||(t.client_match?.name||'').toLowerCase().includes(q)):transactions
      return res.json({ enabled:true,total:transactions.length,results:filtered })
    }

    // POST /api/seed-from-stripe (protected by Bearer API_SECRET)
    // One-time: reconstruct client roster from Stripe payers into Supabase.
    // POST /api/refund { chargeId, amount?, reason? } — issue a Stripe refund.
    // Authorized above via mutationRequiresAuth.
    if (path === 'refund' && method === 'POST') {
      const stripe = getStripe()
      if (!stripe) return res.status(503).json({ error:'Stripe is not configured' })

      const body = (req.body || {}) as any
      const chargeId = typeof body.chargeId === 'string' ? body.chargeId.trim() : ''
      if (!chargeId) return res.status(400).json({ error:'chargeId is required' })

      const ALLOWED_REASONS = ['duplicate','fraudulent','requested_by_customer']
      const refundReason = ALLOWED_REASONS.includes(body.reason) ? body.reason : 'requested_by_customer'

      // Never trust a client-supplied amount: re-read the charge from Stripe and
      // cap the refund at what is genuinely still refundable on it.
      let charge: any
      try {
        charge = await stripe.charges.retrieve(chargeId)
      } catch (e: any) {
        return res.status(404).json({ error:`Charge not found: ${e?.raw?.message || e?.message || e}` })
      }
      if (charge.status !== 'succeeded') {
        return res.status(400).json({ error:`Charge status is "${charge.status}" — only succeeded charges can be refunded` })
      }
      const refundableCents = netAmountCents(charge)
      if (refundableCents <= 0) return res.status(400).json({ error:'Charge has already been fully refunded' })

      let cents = refundableCents
      if (body.amount !== undefined && body.amount !== null && body.amount !== '') {
        const dollars = Number(body.amount)
        if (!Number.isFinite(dollars) || dollars <= 0) {
          return res.status(400).json({ error:'amount must be a positive number of dollars' })
        }
        cents = Math.round(dollars * 100)
        if (cents > refundableCents) {
          return res.status(400).json({ error:`Amount exceeds the $${(refundableCents/100).toFixed(2)} still refundable on this charge` })
        }
      }

      let refund: any
      try {
        refund = await stripe.refunds.create(
          { charge: chargeId, amount: cents, reason: refundReason },
          // Keyed on the charge's refund state *plus* the amount, so a double-click
          // or a serverless retry collapses into one refund, while a deliberate
          // second refund of the same amount later still goes through on its own.
          { idempotencyKey: `refund_${chargeId}_${charge.amount_refunded || 0}_${cents}` }
        )
      } catch (e: any) {
        return res.status(400).json({ error: e?.raw?.message || e?.message || 'Stripe rejected the refund' })
      }

      // Revenue figures come from a 30-minute charge cache — expire it so the refund
      // is reflected immediately instead of up to half an hour later. Age the row out
      // rather than deleting it, so the next cache read still finds a row.
      try {
        await supabase.from('stripe_cache').update({ fetched_at: new Date(0).toISOString() }).eq('id', 1)
      } catch (_) { /* non-fatal */ }

      // Audit trail. The money has already moved, so a logging failure must never
      // be reported back as a failed refund.
      let logged = true
      try {
        const { error } = await supabase.from('refunds').insert({
          id: refund.id,
          charge_id: chargeId,
          amount: cents / 100,
          currency: refund.currency,
          reason: refundReason,
          status: refund.status,
          customer_email: charge.billing_details?.email || charge.receipt_email || null,
          customer_name: charge.billing_details?.name || null
        })
        if (error) logged = false
      } catch (_) { logged = false }

      return res.json({
        id: refund.id,
        chargeId,
        amount: cents / 100,
        currency: refund.currency,
        status: refund.status,
        reason: refundReason,
        remainingRefundable: (refundableCents - cents) / 100,
        logged
      })
    }

    // GET /api/refunds — audit log of refunds issued through this dashboard
    if (path === 'refunds' && method === 'GET') {
      const { data, error } = await supabase.from('refunds').select('*').order('created_at',{ascending:false}).limit(200)
      if (error) return res.json([])
      return res.json(data || [])
    }

    if (path === 'seed-from-stripe' && method === 'POST') {
      if (!getStripe()) return res.status(400).json({ error: 'Stripe not configured' })

      const now = new Date()
      const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 12, 1)
      const allCharges = await fetchAllCharges(twelveMonthsAgo)

      // Aggregate charges per customer
      const payers: Record<string, any> = {}
      for (const c of allCharges) {
        const email = (c.billing_details?.email || c.receipt_email || '').toLowerCase()
        const name = c.billing_details?.name || ''
        const key = email || name.toLowerCase()
        if (!key) continue
        if (!payers[key]) payers[key] = { email, name, total: 0, count: 0, lastDate: '', firstDate: '', lastDesc: '' }
        payers[key].total += netAmount(c)
        payers[key].count++
        const dt = new Date(c.created * 1000).toISOString()
        if (!payers[key].firstDate || dt < payers[key].firstDate) payers[key].firstDate = dt
        if (dt > payers[key].lastDate) { payers[key].lastDate = dt; payers[key].lastDesc = c.description || c.metadata?.product || '' }
        if (name && !payers[key].name) payers[key].name = name
      }

      // Build upsert rows
      const rows = Object.values(payers).map((p: any) => {
        const idBase = (p.email || p.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
        return {
          id: 'stripe-' + idBase,
          type: 'client',
          name: p.name || p.email || 'Unknown',
          email: p.email || null,
          status: 'paid',
          source: 'stripe',
          client_status: 'active',
          client_amount: Math.round(p.total * 100) / 100,
          client_product: p.lastDesc || null,
          client_start_date: p.firstDate ? p.firstDate.slice(0, 10) : null,
          first_contact_date: p.firstDate ? p.firstDate.slice(0, 10) : null,
          last_action: `Imported from Stripe — ${p.count} payment(s), $${Math.round(p.total)} total`,
          last_action_date: p.lastDate || new Date().toISOString(),
          notes: `Auto-imported from Stripe. Lifetime: $${Math.round(p.total)} across ${p.count} charge(s).`
        }
      })

      // Upsert in batches
      let inserted = 0
      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100)
        const { error, count } = await supabase.from('leads').upsert(batch, { onConflict: 'id', count: 'exact' })
        if (error) return res.status(500).json({ error: error.message, insertedSoFar: inserted })
        inserted += batch.length
      }

      return res.json({ ok: true, stripePayers: rows.length, upsertedClients: inserted, totalChargesScanned: allCharges.length })
    }
    if (path === 'seed-from-stripe') return res.status(405).json({ error:'Method not allowed' })

    res.status(404).json({ error:'Not found' })
  } catch (err:any) {
    console.error(err)
    res.status(500).json({ error:process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message })
  }
}
