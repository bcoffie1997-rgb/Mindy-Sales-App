// @ts-nocheck — runtime-tested serverless handler; skip strict type-check at build
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { createHmac, timingSafeEqual } from 'node:crypto'

type VercelRequest = {
  query: Record<string, string | string[] | undefined>
  headers: Record<string, string | string[] | undefined>
  method?: string
  url?: string
  body?: any
}

type VercelResponse = {
  setHeader(name: string, value: string | string[]): VercelResponse
  status(code: number): VercelResponse
  json(value: any): VercelResponse
  end(): VercelResponse
}

const AGENTS = ['gc-lead-intake','gc-email-responder','gc-appointment-setter','gc-post-call','gc-crm-morning','gc-crm-evening','gc-qa-health']
const PROPOSAL_KEYWORDS = ['proposal sent','proposal delivered','pricing sent','engagement letter','sent proposal','sent pricing','payment link']

const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || ''
const SESSION_SECRET = process.env.DASHBOARD_SESSION_SECRET || DASHBOARD_PASSWORD
const SESSION_COOKIE = 'govcon_dashboard_session'

// ── Slack notifications (optional; silent no-op until SLACK_WEBHOOK_URL is set) ──
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || ''
async function notifySlack(text: string) {
  if (!SLACK_WEBHOOK_URL) return
  try {
    await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
  } catch { /* notifications must never break the API */ }
}

// ── Slack direct messages (optional; needs SLACK_BOT_TOKEN with chat:write + im:write) ──
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || ''
const SLACK_USER_IDS: Record<string, string> = {
  branden: 'U03HUA4JMTP',
  eric: 'U03HVFF8EHJ',
  'eric coffie': 'U03HVFF8EHJ',
  shanoor: 'U0B8M3L1M9V',
  sikandar: 'U0ADM0ZNK6G',
  'syed jawad hussain': 'U03QP362KU0',
  jawad: 'U03QP362KU0',
  'usama ashraf': 'U07UF1ED88Y',
  usama: 'U07UF1ED88Y',
  kash: 'U07H5GDK1ME',
  kashif: 'U07H5GDK1ME',
}
function slackUserId(name: string): string {
  const n = (name || '').trim().toLowerCase()
  return SLACK_USER_IDS[n] || SLACK_USER_IDS[n.split(/\s+/)[0]] || ''
}
async function slackDM(name: string, text: string) {
  if (!SLACK_BOT_TOKEN) return
  const userId = slackUserId(name)
  if (!userId) return
  try {
    const open = await fetch('https://slack.com/api/conversations.open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
      body: JSON.stringify({ users: userId }),
    }).then(r => r.json())
    const channel = open?.channel?.id
    if (!channel) return
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
      body: JSON.stringify({ channel, text }),
    })
  } catch { /* DMs must never break the API */ }
}

// Automatic priority: due within 3 days → high, within 7 days → medium, otherwise none
function autoPriority(due: string): string {
  const today = new Date().toISOString().slice(0, 10)
  const days = Math.round((new Date(due + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime()) / 86400000)
  if (days <= 3) return 'high'
  if (days <= 7) return 'medium'
  return 'none'
}

function taskPriority(task: any): string {
  if (task.due_date && task.status !== 'done') return autoPriority(task.due_date)
  return task.priority || 'none'
}

function sessionToken() {
  return createHmac('sha256', SESSION_SECRET).update('authenticated-dashboard-session-v1').digest('hex')
}

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a), bb = Buffer.from(b)
  return aa.length === bb.length && timingSafeEqual(aa, bb)
}

function cookieValue(req: VercelRequest, name: string) {
  const raw = req.headers.cookie || ''
  const entry = raw.split(';').map(v => v.trim()).find(v => v.startsWith(`${name}=`))
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : ''
}

function isAuthenticated(req: VercelRequest) {
  if (!DASHBOARD_PASSWORD) return true
  const token = cookieValue(req, SESSION_COOKIE)
  return !!token && safeEqual(token, sessionToken())
}

// ── Supabase client (inlined; no relative imports to keep ESM happy) ──
const SUPA_URL = (process.env.SUPABASE_URL || '').trim()
const SUPA_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
let initError: string | null = null
let supabase: any
try {
  supabase = createClient(SUPA_URL || 'https://placeholder.supabase.co', SUPA_KEY || 'placeholder', { auth: { persistSession: false } })
} catch (err: any) {
  initError = err?.message || String(err)
  supabase = createClient('https://placeholder.supabase.co', 'placeholder', { auth: { persistSession: false } })
}
const supabaseReady = !!(SUPA_URL && SUPA_KEY) && !initError
const supabaseUrlValue = SUPA_URL

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
  const { data: cached } = await supabase.from('stripe_cache').select('data, fetched_at').eq('id', 1).single()
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
function matchStripeToLead(email: string, name: string, leads: any[]): any | null {
  if (!email && !name) return null
  const e = (email || '').toLowerCase(), n = (name || '').toLowerCase()
  return leads.find((l: any) => (e && l.email && l.email.toLowerCase() === e) || (n && l.name && l.name.toLowerCase() === n)) || null
}

function normalizeLead(lead: any) {
  if (!lead) return lead
  const raw = String(lead.score || '').toUpperCase()
  const score = raw === 'COLD' ? 'BASIC' : raw
  return score ? { ...lead, score } : lead
}

// PostgREST caps a single select at 1000 rows. This range-paginates so we get
// every row regardless of table size (the leads table now holds ~2k+ rows).
async function fetchAllRows(table: string, columns = '*', applyFilter?: (q: any) => any): Promise<any[]> {
  const out: any[] = []
  const STEP = 1000
  for (let from = 0; from < 100000; from += STEP) {
    let q = supabase.from(table).select(columns).range(from, from + STEP - 1)
    if (applyFilter) q = applyFilter(q)
    const { data, error } = await q
    if (error) throw error
    if (!data || !data.length) break
    out.push(...data)
    if (data.length < STEP) break
  }
  return out
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'same-origin')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // Derive the route from the URL itself (robust across Vercel param shapes)
  const rawRoute = req.query.route
  let slug: string[]
  if (Array.isArray(rawRoute)) slug = rawRoute
  else if (typeof rawRoute === 'string' && rawRoute) slug = rawRoute.split('/')
  else {
    // Fall back to parsing the request URL
    const urlPath = (req.url || '').split('?')[0].replace(/^\/api\/?/, '').replace(/^\/+/, '')
    slug = urlPath ? urlPath.split('/') : []
  }
  const path = slug.join('/')
  const method = req.method || 'GET'

  if (path === 'session') {
    if (method === 'GET') {
      return res.json({ authenticated: isAuthenticated(req), authRequired: !!DASHBOARD_PASSWORD })
    }
    if (method === 'POST') {
      if (!DASHBOARD_PASSWORD) return res.json({ authenticated: true, authRequired: false })
      const password = typeof req.body?.password === 'string' ? req.body.password : ''
      if (!safeEqual(password, DASHBOARD_PASSWORD)) {
        return res.status(401).json({ error: 'Invalid password' })
      }
      const secure = process.env.VERCEL || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''
      res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${sessionToken()}; Path=/; HttpOnly${secure}; SameSite=Strict; Max-Age=28800`)
      return res.json({ authenticated: true, authRequired: true })
    }
    if (method === 'DELETE') {
      res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`)
      return res.json({ authenticated: false, authRequired: !!DASHBOARD_PASSWORD })
    }
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Minimal public health endpoint. Do not expose environment names or values.
  if (path === 'health') {
    if (!supabaseReady) return res.status(503).json({ status: 'degraded', database: 'unavailable' })
    try {
      const { error } = await supabase.from('leads').select('id').limit(1)
      if (error) return res.status(503).json({ status: 'degraded', database: 'unavailable' })
      return res.json({ status: 'ok', database: 'connected' })
    } catch {
      return res.status(503).json({ status: 'degraded', database: 'unavailable' })
    }
  }

  // Vercel Cron: Monday digest of open tasks due this week, posted to Slack.
  // Vercel automatically sends Authorization: Bearer $CRON_SECRET when CRON_SECRET is set.
  if (path === 'tasks-digest' && method === 'GET') {
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    if (!supabaseReady) return res.status(503).json({ error: 'Database unavailable' })
    try {
      const today = new Date().toISOString().slice(0, 10)
      const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)

      // Daily: recalculate automatic priorities; ping when a task becomes high priority
      const { data: open, error: openErr } = await supabase.from('tasks').select('*')
        .neq('status', 'done').not('due_date', 'is', null)
      if (openErr) throw openErr
      let bumped = 0
      for (const t of open || []) {
        const p = autoPriority(t.due_date)
        if (p !== t.priority) {
          const { error: upErr } = await supabase.from('tasks').update({ priority: p }).eq('id', t.id)
          if (!upErr && p === 'high') {
            bumped++
            await notifySlack(`🔥 Now HIGH priority (due ${t.due_date}): *${t.title}*${t.assignee ? ` — ${t.assignee}` : ''}`)
            if (t.assignee) await slackDM(t.assignee, `🔥 Your task *${t.title}* is now HIGH priority — due ${t.due_date}.`)
          }
        }
      }

      // Mondays: post the weekly digest
      let digestItems = null
      if (new Date().getUTCDay() === 1) {
        const { data: due, error } = await supabase.from('tasks').select('*')
          .neq('status', 'done').not('due_date', 'is', null).lte('due_date', weekEnd).order('due_date', { ascending: true })
        if (error) throw error
        const lines = (due || []).map((t: any) => {
          const overdue = t.due_date < today ? '⚠️ ' : ''
          const who = t.assignee ? ` (${t.assignee})` : ''
          return `• ${overdue}${t.due_date} — ${t.title}${who}`
        })
        digestItems = lines.length
        const text = lines.length
          ? `🗓 *Weekly task digest* — ${lines.length} open item${lines.length === 1 ? '' : 's'} due this week:\n${lines.join('\n')}`
          : '🗓 *Weekly task digest* — nothing due this week. 🎉'
        await notifySlack(text)
        // Per-person DM with only their items
        const byAssignee = new Map<string, any[]>()
        for (const t of due || []) {
          if (!t.assignee) continue
          if (!byAssignee.has(t.assignee)) byAssignee.set(t.assignee, [])
          byAssignee.get(t.assignee)!.push(t)
        }
        for (const [name, items] of byAssignee) {
          const own = items.map((t: any) => {
            const overdue = t.due_date < today ? '⚠️ ' : ''
            return `• ${overdue}${t.due_date} — ${t.title}`
          })
          await slackDM(name, `🗓 *Your weekly digest* — ${items.length} open item${items.length === 1 ? '' : 's'} due this week:\n${own.join('\n')}`)
        }
      }
      return res.json({ ok: true, posted: !!SLACK_WEBHOOK_URL, bumpedToHigh: bumped, digestItems })
    } catch (err: any) {
      return res.status(500).json({ error: err.message })
    }
  }

  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Authentication required' })
  if (!supabaseReady) return res.status(503).json({ error: 'Database unavailable' })
  try {
    // GET /api/stats
    if (path === 'stats') {
      const [all, { data: events }] = await Promise.all([
        fetchAllRows('leads', '*'),
        supabase.from('agent_events').select('agent_name,event_type,ts').eq('event_type','run_summary').order('ts',{ascending:true})
      ])
      const normalized = (all||[]).map(normalizeLead)
      const leads = normalized.filter((l:any) => l.type !== 'client')
      const clients = normalized.filter((l:any) => l.type === 'client')
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
        const last = runs[runs.length-1]
        agentHealth[agent] = { lastRun: last?.ts||null, runsToday: runs.filter((e:any) => new Date(e.ts).toDateString()===todayStr).length, status: last?(now-new Date(last.ts).getTime()<86400000?'ok':'stale'):'never' }
      }
      const proposalsOut = normalized.filter((l:any) => l.status==='proposal_sent'||PROPOSAL_KEYWORDS.some(kw=>((l.last_action||'')+' '+(l.notes||'')).toLowerCase().includes(kw))).length
      return res.json({ total:normalized.length, totalLeads:leads.length, totalClients:clients.length, byScore, byStatus, clientsByTier, clientsByStatus, agentHealth, proposalsOut, recentLeads:leads.filter((l:any)=>l.status!=='paid').slice(-5).reverse(), recentClients:clients.slice(-5).reverse() })
    }

    // GET /api/leads-only
    if (path === 'leads-only') {
      const data = await fetchAllRows('leads', '*', (q:any) => q.neq('type','client').order('created_at',{ascending:false}))
      return res.json((data||[]).map(normalizeLead))
    }

    // GET /api/clients
    if (path === 'clients') {
      const data = await fetchAllRows('leads', '*', (q:any) => q.eq('type','client').order('created_at',{ascending:false}))
      return res.json((data||[]).map(normalizeLead))
    }

    // GET /api/leads
    if (path === 'leads' && method === 'GET') {
      const data = await fetchAllRows('leads', '*', (q:any) => q.order('created_at',{ascending:false}))
      return res.json((data||[]).map(normalizeLead))
    }

    // GET/PATCH /api/leads/:id
    if (slug[0]==='leads' && slug[1] && slug.length===2) {
      const id = slug[1]
      if (method === 'GET') {
        const { data, error } = await supabase.from('leads').select('*').eq('id',id).single()
        if (error) return res.status(404).json({ error:'Lead not found' })
        return res.json(normalizeLead(data))
      }
      if (method === 'PATCH') {
        const { data, error } = await supabase.from('leads').update({...req.body, last_action_date:new Date().toISOString()}).eq('id',id).select().single()
        if (error) return res.status(404).json({ error:'Lead not found' })
        return res.json(data)
      }
    }

    // GET /api/calls
    if (path === 'calls') {
      const { data } = await supabase.from('calls_cache').select('payload').eq('id',1).single()
      return res.json(data?.payload||{today:[],tomorrow:[],this_week:[],generated_at:null})
    }

    // GET /api/events
    if (path === 'events') {
      const hours = Number(req.query.hours)||24
      const cutoff = new Date(Date.now()-hours*3600000).toISOString()
      const { data, error } = await supabase.from('agent_events').select('*').gte('ts',cutoff).order('ts',{ascending:false}).limit(200)
      if (error) throw error
      return res.json((data||[]).map((event:any) => ({
        ...event,
        from: event.from || event.agent_name || 'unknown',
        type: event.type || event.event_type || 'unknown',
      })))
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
      const { data, error } = await supabase.from('reports').select('content').eq('filename',`${date}-${type}.md`).single()
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
      const [allCharges,allLeads] = await Promise.all([fetchAllCharges(twelveMonthsAgo),fetchAllRows('leads','id,name,email,type,score,client_tier')])
      const monthlyRevenue:Record<string,{revenue:number;count:number}> = {}
      for (const c of allCharges) {
        const d = new Date(c.created*1000), key = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')
        if (!monthlyRevenue[key]) monthlyRevenue[key] = {revenue:0,count:0}
        monthlyRevenue[key].revenue += c.amount/100; monthlyRevenue[key].count++
      }
      const thisMonthKey = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')
      const lastMonthKey = startOfLastMonth.getFullYear()+'-'+String(startOfLastMonth.getMonth()+1).padStart(2,'0')
      const thisMonth = monthlyRevenue[thisMonthKey]?.revenue||0, lastMonth = monthlyRevenue[lastMonthKey]?.revenue||0
      const ytd = Object.entries(monthlyRevenue).filter(([k])=>k>=now.getFullYear()+'-01').reduce((s,[,v])=>s+v.revenue,0)
      const thisMonthCharges = allCharges.filter(c=>c.created>=Math.floor(startOfMonth.getTime()/1000))
      const dailyRevenue:Record<string,number> = {}
      for (const c of thisMonthCharges) { const day=new Date(c.created*1000).toISOString().slice(0,10); dailyRevenue[day]=(dailyRevenue[day]||0)+c.amount/100 }
      const recentTransactions = allCharges.slice(0,30).map((c:any) => { const email=c.billing_details?.email||c.receipt_email||'', name=c.billing_details?.name||'', match=matchStripeToLead(email,name,allLeads||[]); return {id:c.id,amount:c.amount/100,currency:c.currency,description:c.description||c.metadata?.product||'Payment',customer_email:email,customer_name:name,date:new Date(c.created*1000).toISOString(),status:c.status,refunded:!!c.refunded,client_match:match?{id:match.id,name:match.name,type:match.type,score:match.score,client_tier:match.client_tier}:null,platform:c.metadata?.platform||null} })
      const productGroups:Record<string,{name:string;count:number;total:number;customers:string[]}> = {}
      for (const c of allCharges) { const rawDesc=c.description||c.metadata?.memberpress_product||c.metadata?.product||'Other'; let group=rawDesc; if(/subscription (update|creation)/i.test(rawDesc))group='Mighty Networks / Subscription'; else if(/ai tools.*crm.*research/i.test(rawDesc))group='AI Tools + CRM + Research'; else if(/ai tools/i.test(rawDesc))group='AI Tools'; if(!productGroups[group])productGroups[group]={name:group,count:0,total:0,customers:[]}; productGroups[group].count++; productGroups[group].total+=c.amount/100; const cn=c.billing_details?.name||c.receipt_email||'Unknown'; if(!productGroups[group].customers.includes(cn))productGroups[group].customers.push(cn) }
      const mom = lastMonth>0?((thisMonth-lastMonth)/lastMonth*100).toFixed(1):null
      return res.json({ enabled:true,thisMonth,lastMonth,ytd,transactionCount:thisMonthCharges.length,totalCharges:allCharges.length,recentTransactions,dailyRevenue,monthlyRevenue:Object.entries(monthlyRevenue).sort().map(([month,data])=>({month,...data})),productGroups:Object.values(productGroups).sort((a,b)=>b.total-a.total),monthOverMonth:mom })
    }

    // GET /api/revenue/report
    if (path === 'revenue/report') {
      const stripe = getStripe()
      if (!stripe) return res.json({ enabled:false })
      const now = new Date(), twelveMonthsAgo = new Date(now.getFullYear(),now.getMonth()-12,1)
      const [allCharges,activeSubs,allLeads] = await Promise.all([fetchAllCharges(twelveMonthsAgo),stripe.subscriptions.list({limit:100,status:'active'}),fetchAllRows('leads','id,name,email,type,client_tier,client_status')])
      const monthly:Record<string,{revenue:number;count:number}> = {}
      for (const c of allCharges) { const d=new Date(c.created*1000),key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); if(!monthly[key])monthly[key]={revenue:0,count:0}; monthly[key].revenue+=c.amount/100; monthly[key].count++ }
      let mrr=0; for (const s of activeSubs.data) { const item=s.items.data[0],amount=item?.price?.unit_amount?item.price.unit_amount/100:0,interval=item?.price?.recurring?.interval||'month'; mrr+=interval==='year'?amount/12:amount }
      const sortedMonths=Object.entries(monthly).sort(), currentMonth=sortedMonths[sortedMonths.length-1], prevMonth=sortedMonths[sortedMonths.length-2]
      const ytd=sortedMonths.filter(([k])=>k.startsWith(String(now.getFullYear()))).reduce((s,[,v])=>s+v.revenue,0)
      const customerTotals:Record<string,{name:string;email:string;total:number;count:number}> = {}
      for (const c of allCharges) { const email=c.billing_details?.email||c.receipt_email||'',name=c.billing_details?.name||email||'Unknown',key=email||name; if(!customerTotals[key])customerTotals[key]={name,email,total:0,count:0}; customerTotals[key].total+=c.amount/100; customerTotals[key].count++ }
      const topCustomers=Object.values(customerTotals).sort((a,b)=>b.total-a.total).slice(0,10)
      const growthData=sortedMonths.map(([month,data],i)=>{
        const previous = i > 0 ? sortedMonths[i-1][1].revenue : 0
        return { month, revenue:data.revenue, count:data.count, growth:previous>0?((data.revenue-previous)/previous*100).toFixed(1)+'%':'N/A' }
      })
      return res.json({ enabled:true, report:{ generated:now.toISOString(), summary:{ thisMonth:currentMonth?{month:currentMonth[0],revenue:currentMonth[1].revenue,transactions:currentMonth[1].count}:null, lastMonth:prevMonth?{month:prevMonth[0],revenue:prevMonth[1].revenue,transactions:prevMonth[1].count}:null, ytd,mrr:Math.round(mrr*100)/100,activeSubscriptions:activeSubs.data.length,totalTransactions:allCharges.length,avgTransactionValue:allCharges.length>0?Math.round(allCharges.reduce((s,c)=>s+c.amount/100,0)/allCharges.length):0 }, monthlyTrend:growthData, topCustomers, clientMatches:topCustomers.map(tc=>{const match=matchStripeToLead(tc.email,tc.name,allLeads||[]);return{...tc,client_match:match?{name:match.name,type:match.type,tier:match.client_tier,status:match.client_status}:null}}) } })
    }

    // GET /api/subscriptions
    if (path === 'subscriptions') {
      const stripe = getStripe()
      if (!stripe) return res.json({ enabled:false })
      const [allLeads,activeSubs,pastDueSubs] = await Promise.all([fetchAllRows('leads','id,name,email,type,client_tier'),stripe.subscriptions.list({limit:100,status:'active',expand:['data.customer']}),stripe.subscriptions.list({limit:100,status:'past_due',expand:['data.customer']})])
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
      const [allCharges,allLeads]=await Promise.all([fetchAllCharges(twelveMonthsAgo),fetchAllRows('leads','id,name,email,type,score,status,client_tier')])
      const payers:Record<string,{name:string;email:string;total:number;count:number;lastPayment:string}> = {}
      for (const c of allCharges) { const email=(c.billing_details?.email||c.receipt_email||'').toLowerCase(),name=c.billing_details?.name||'',key=email||name.toLowerCase(); if(!key)continue; if(!payers[key])payers[key]={name,email,total:0,count:0,lastPayment:''}; payers[key].total+=c.amount/100; payers[key].count++; const dt=new Date(c.created*1000).toISOString(); if(dt>payers[key].lastPayment)payers[key].lastPayment=dt; if(name&&!payers[key].name)payers[key].name=name }
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
      const [allCharges,allLeads]=await Promise.all([fetchAllCharges(twelveMonthsAgo),fetchAllRows('leads','id,name,email,type,score,client_tier,status')])
      const q=((req.query.q as string)||'').toLowerCase()
      const transactions=allCharges.map((c:any)=>{ const email=c.billing_details?.email||c.receipt_email||'',name=c.billing_details?.name||'',desc=c.description||c.metadata?.memberpress_product||c.metadata?.product||'',match=matchStripeToLead(email,name,allLeads||[]); return {id:c.id,amount:c.amount/100,currency:c.currency,description:desc,customer_email:email,customer_name:name,date:new Date(c.created*1000).toISOString(),refunded:!!c.refunded,client_match:match?{id:match.id,name:match.name,type:match.type,score:match.score,client_tier:match.client_tier,status:match.status}:null,platform:c.metadata?.platform||null} })
      const filtered=q?transactions.filter((t:any)=>t.customer_name.toLowerCase().includes(q)||t.customer_email.toLowerCase().includes(q)||t.description.toLowerCase().includes(q)||(t.client_match?.name||'').toLowerCase().includes(q)):transactions
      return res.json({ enabled:true,total:transactions.length,results:filtered })
    }

    // POST /api/stripe-refund  { charge: 'ch_...' } — full refund, cannot be undone
    if (path === 'stripe-refund' && method === 'POST') {
      const stripe = getStripe()
      if (!stripe) return res.status(503).json({ error: 'Stripe not configured' })
      const chargeId = typeof req.body?.charge === 'string' ? req.body.charge.trim() : ''
      if (!chargeId) return res.status(400).json({ error: 'Charge id is required' })
      let charge: any
      try {
        charge = await stripe.charges.retrieve(chargeId)
      } catch (err: any) {
        if (err?.code === 'resource_missing') return res.status(404).json({ error: 'Charge not found in Stripe' })
        throw err
      }
      if (charge.refunded) return res.status(409).json({ error: 'That payment was already refunded' })
      const refund = await stripe.refunds.create({ charge: chargeId })
      // Bust the charges cache so revenue numbers refresh on next load
      await supabase.from('stripe_cache').upsert({ id: 1, data: [], fetched_at: new Date(0).toISOString() })
      const who = charge.billing_details?.name || charge.billing_details?.email || charge.receipt_email || 'customer'
      await notifySlack(`💸 Refund issued: *$${(charge.amount / 100).toFixed(2)}* — ${charge.description || 'Payment'} (${who})`)
      return res.json({ ok: true, refund: { id: refund.id, amount: refund.amount / 100, status: refund.status } })
    }

    // POST /api/stripe-cancel-sub  { subscription: 'sub_...' } — cancels immediately
    if (path === 'stripe-cancel-sub' && method === 'POST') {
      const stripe = getStripe()
      if (!stripe) return res.status(503).json({ error: 'Stripe not configured' })
      const subId = typeof req.body?.subscription === 'string' ? req.body.subscription.trim() : ''
      if (!subId) return res.status(400).json({ error: 'Subscription id is required' })
      let canceled: any
      try {
        canceled = await stripe.subscriptions.cancel(subId)
      } catch (err: any) {
        if (err?.code === 'resource_missing') return res.status(404).json({ error: 'Subscription not found in Stripe' })
        throw err
      }
      const item = canceled.items?.data?.[0]
      const amount = item?.price?.unit_amount ? item.price.unit_amount / 100 : 0
      const interval = item?.price?.recurring?.interval || 'mo'
      const custObj = canceled.customer
      const who = (typeof custObj === 'object' && custObj !== null && !(custObj as any).deleted) ? ((custObj as any).name || (custObj as any).email || 'customer') : 'customer'
      await notifySlack(`🚫 Subscription canceled: ${who} — $${amount.toFixed(2)}/${interval}`)
      return res.json({ ok: true, status: canceled.status })
    }

    // POST /api/seed-from-stripe (protected by the dashboard session)
    // One-time: reconstruct client roster from Stripe payers into Supabase
    if (path === 'seed-from-stripe') {
      if (method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
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
        payers[key].total += c.amount / 100
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

    // POST /api/sync-ghl[?page=N&pages=M] (protected by the dashboard session)
    // Opportunity-driven, RESUMABLE lead import from GoHighLevel → Supabase leads table.
    // The account has ~20k contacts but only ~2k opportunities (the real pipeline), so we
    // import leads from opportunities. Each call processes a bounded number of opportunity
    // pages within a ~22s time budget, then returns nextPage so it can be called repeatedly
    // until done — this keeps every invocation safely under the 30s serverless limit.
    if (path === 'sync-ghl') {
      if (method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

      const GHL_TOKEN = process.env.GHL_API_KEY
      const GHL_LOCATION = process.env.GHL_LOCATION_ID
      if (!GHL_TOKEN || !GHL_LOCATION) return res.status(400).json({ error: 'GHL_API_KEY or GHL_LOCATION_ID env vars not set' })

      const ghlHeaders: any = { 'Authorization': `Bearer ${GHL_TOKEN}`, 'Version': '2021-07-28', 'Content-Type': 'application/json' }
      const startPage = Math.max(1, parseInt(req.query.page as string) || 1)
      const maxPages = Math.min(30, Math.max(1, parseInt(req.query.pages as string) || 25))
      const startedAt = Date.now()
      const TIME_BUDGET_MS = 22000

      // Map pipeline stage IDs → human-readable stage names (one cheap call)
      const stageNameById: Record<string, string> = {}
      try {
        const plResp = await fetch(`https://services.leadconnectorhq.com/opportunities/pipelines?locationId=${GHL_LOCATION}`, { headers: ghlHeaders })
        if (plResp.ok) {
          const plJson: any = await plResp.json()
          for (const p of (plJson.pipelines || []))
            for (const s of (p.stages || []))
              stageNameById[s.id] = s.name || ''
        }
      } catch {}

      // Existing Stripe client emails — never overwrite a paying client with a lead row
      const { data: existingClients } = await supabase.from('leads').select('email').eq('type', 'client')
      const clientEmails = new Set((existingClients || []).map((c: any) => (c.email || '').toLowerCase()).filter(Boolean))

      function scoreFor(stage: string) {
        const s = stage.toLowerCase()
        if (s.includes('sold') || s.includes('won') || s.includes('closed')) return { score: 'HOT', status: 'closed_won' }
        if (s.includes('proposal') || s.includes('contract') || s.includes('payment') || s.includes('closing')) return { score: 'HOT', status: 'proposal_sent' }
        if (s.includes('missed')) return { score: 'WARM', status: 'no_show' }
        if (s.includes('meeting') || s.includes('call') || s.includes('schedule') || s.includes('webinar') || s.includes('bid')) return { score: 'HOT', status: 'booked' }
        if (s.includes('follow')) return { score: 'WARM', status: 'meeting_interest' }
        if (s.includes('lost') || s.includes('dead') || s.includes('disqualified')) return { score: 'BASIC', status: 'closed_lost' }
        return { score: 'WARM', status: 'new' }
      }

      let page = startPage
      let oppsScanned = 0, upserted = 0, skippedClients = 0
      let totalOpps: number | null = null
      let done = false

      while (page < startPage + maxPages) {
        if (Date.now() - startedAt > TIME_BUDGET_MS) break
        const resp = await fetch(`https://services.leadconnectorhq.com/opportunities/search?location_id=${GHL_LOCATION}&limit=100&page=${page}`, { headers: ghlHeaders })
        if (!resp.ok) {
          const txt = await resp.text()
          return res.status(502).json({ error: `GHL opportunities API error ${resp.status}`, detail: txt.slice(0, 400), nextPage: page })
        }
        const json: any = await resp.json()
        if (totalOpps === null) totalOpps = json.meta?.total ?? null
        const batch: any[] = json.opportunities || []
        if (!batch.length) { done = true; break }

        const rows: any[] = []
        for (const opp of batch) {
          const contact = opp.contact || {}
          const cid = contact.id || opp.contactId
          if (!cid) continue
          const email = (contact.email || '').toLowerCase()
          if (email && clientEmails.has(email)) { skippedClients++; continue }

          const stage = stageNameById[opp.pipelineStageId] || ''
          const { score, status } = scoreFor(stage)
          const name = contact.name || [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.email || opp.name || 'Unknown'
          const tags = (contact.tags || []).join(', ')

          rows.push({
            id: 'ghl-' + cid,
            type: 'lead',
            name,
            email: contact.email || null,
            phone: contact.phone || null,
            company: contact.companyName || null,
            source: opp.source || 'gohighlevel',
            score,
            status,
            first_contact_date: opp.createdAt ? opp.createdAt.slice(0, 10) : null,
            last_action: `Pipeline: ${opp.name || 'Opportunity'}${stage ? ' (' + stage + ')' : ''}`,
            last_action_date: opp.updatedAt || opp.lastStageChangeAt || new Date().toISOString(),
            notes: tags ? `Tags: ${tags}` : null,
            metadata: {
              ghl_id: cid,
              ghl_opp_id: opp.id,
              ghl_stage: stage || null,
              opp_value: opp.monetaryValue ?? null,
              opp_status: opp.status || null
            }
          })
        }

        if (rows.length) {
          const { error } = await supabase.from('leads').upsert(rows, { onConflict: 'id' })
          if (error) return res.status(500).json({ error: error.message, upsertedSoFar: upserted, nextPage: page })
          upserted += rows.length
        }
        oppsScanned += batch.length

        // Stop when the API signals there are no further pages
        if (batch.length < 100 || !json.meta?.nextPage) { done = true; break }
        page++
      }

      return res.json({
        ok: true,
        done,
        totalOpps,
        startPage,
        lastProcessedPage: done ? page : page - 1,
        nextPage: done ? null : page,
        oppsScannedThisCall: oppsScanned,
        upsertedThisCall: upserted,
        skippedExistingClients: skippedClients,
        hint: done
          ? 'Sync complete 🎉'
          : `Not finished — send another authenticated POST with ?page=${page}`
      })
    }

    // GET /api/transcripts  (optional ?lead=:id to filter to one lead)
    if (path === 'transcripts' && method === 'GET') {
      let q = supabase.from('transcripts').select('*').order('meeting_date', { ascending: false }).limit(200)
      if (req.query.lead) q = q.eq('matched_lead_id', req.query.lead as string)
      const { data, error } = await q
      if (error) throw error
      return res.json(data || [])
    }

    // POST /api/sync-fireflies (protected by the dashboard session)
    // Pull call transcripts + summaries from Fireflies → Supabase transcripts table
    if (path === 'sync-fireflies') {
      if (method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

      const FF_KEY = process.env.FIREFLIES_API_KEY
      if (!FF_KEY) return res.status(400).json({ error: 'FIREFLIES_API_KEY env var not set' })

      const ffQuery = `query Transcripts($limit: Int, $skip: Int) {
        transcripts(limit: $limit, skip: $skip) {
          id
          title
          date
          duration
          transcript_url
          participants
          meeting_attendees { displayName email }
          summary { overview short_summary action_items keywords bullet_gist }
        }
      }`

      const allTranscripts: any[] = []
      let skip = 0
      const limit = 25
      while (true) {
        const resp = await fetch('https://api.fireflies.ai/graphql', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${FF_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: ffQuery, variables: { limit, skip } })
        })
        if (!resp.ok) {
          const txt = await resp.text()
          return res.status(502).json({ error: `Fireflies API error ${resp.status}`, detail: txt.slice(0, 500) })
        }
        const json: any = await resp.json()
        if (json.errors) return res.status(502).json({ error: 'Fireflies GraphQL error', detail: json.errors })
        const batch: any[] = json.data?.transcripts || []
        allTranscripts.push(...batch)
        if (batch.length < limit) break
        skip += limit
        if (skip > 400) break // safety cap (~400 most recent calls)
      }

      // Load existing leads/clients for email matching
      const allLeads = await fetchAllRows('leads','id,name,email')
      const leadByEmail: Record<string, any> = {}
      for (const l of (allLeads || [])) { if (l.email) leadByEmail[l.email.toLowerCase()] = l }

      const rows = allTranscripts.map((t: any) => {
        const attendees = t.meeting_attendees || []
        const emails = attendees.map((a: any) => (a.email || '').toLowerCase()).filter(Boolean)
        let matched: any = null
        for (const e of emails) { if (leadByEmail[e]) { matched = leadByEmail[e]; break } }
        const s = t.summary || {}
        const actionItems = Array.isArray(s.action_items) ? s.action_items.join('\n') : (s.action_items || null)
        return {
          id: t.id,
          title: t.title || 'Untitled call',
          meeting_date: t.date ? new Date(t.date).toISOString() : null,
          duration: t.duration || null,
          transcript_url: t.transcript_url || null,
          participants: t.participants || emails,
          overview: s.overview || s.bullet_gist || null,
          short_summary: s.short_summary || null,
          action_items: actionItems,
          keywords: s.keywords || [],
          matched_lead_id: matched?.id || null,
          metadata: { attendees }
        }
      })

      let upserted = 0
      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100)
        const { error } = await supabase.from('transcripts').upsert(batch, { onConflict: 'id' })
        if (error) return res.status(500).json({ error: error.message, upsertedSoFar: upserted })
        upserted += batch.length
      }

      return res.json({
        ok: true,
        transcriptsFound: allTranscripts.length,
        upserted,
        matchedToLeads: rows.filter((r: any) => r.matched_lead_id).length
      })
    }

    // GET /api/client?id=xxx — single client with payments + calls + transcripts
    if (path === 'client' && method === 'GET') {
      const id = req.query.id as string
      if (!id) return res.status(400).json({ error: 'id required' })
      const { data: client, error } = await supabase.from('leads').select('*').eq('id', id).single()
      if (error || !client) return res.json({ client: null })

      // Stripe payments for this client
      let payments: Record<string, number> = {}
      const stripe = getStripe()
      if (stripe && client.email) {
        try {
          const customers = await stripe.customers.list({ email: client.email, limit: 5 })
          const custId = customers.data[0]?.id
          if (custId) {
            const now = new Date()
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
            const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
            const charges = await stripe.charges.list({ customer: custId, limit: 200 })
            const succeeded = charges.data.filter((c: any) => c.status === 'succeeded')
            payments.lifetime = succeeded.reduce((s: number, c: any) => s + c.amount / 100, 0)
            payments.thisMonth = succeeded.filter((c: any) => c.created * 1000 >= startOfMonth.getTime()).reduce((s: number, c: any) => s + c.amount / 100, 0)
            payments.lastMonth = succeeded.filter((c: any) => c.created * 1000 >= startOfLastMonth.getTime() && c.created * 1000 < startOfMonth.getTime()).reduce((s: number, c: any) => s + c.amount / 100, 0)
          }
        } catch (_) { /* stripe not available */ }
      }

      // Transcripts matched to this client
      const { data: transcripts } = await supabase.from('transcripts').select('id,title,meeting_date,short_summary,overview').eq('matched_lead_id', id).order('meeting_date', { ascending: false }).limit(10)

      // Calls (upcoming/past from agent_events if available)
      let calls = { upcoming: [], past: [] }

      return res.json({ client: normalizeLead(client), payments, transcripts: transcripts || [], calls })
    }

    // GET /api/command-center — live health check of all connected systems
    if (path === 'command-center' && method === 'GET') {
      const checkedAt = new Date().toISOString()
      const systems: any[] = []

      // Supabase / Database
      try {
        const { count, error } = await supabase.from('leads').select('*', { count: 'exact', head: true })
        systems.push({ key: 'database', name: 'Database', vendor: 'Supabase', status: error ? 'degraded' : 'operational', metric: error ? null : `${count} rows`, lastChecked: checkedAt })
      } catch {
        systems.push({ key: 'database', name: 'Database', vendor: 'Supabase', status: 'down', lastChecked: checkedAt })
      }

      // Stripe
      const stripeKey = process.env.STRIPE_SECRET_KEY
      if (stripeKey) {
        try {
          const stripe = getStripe()
          await stripe!.customers.list({ limit: 1 })
          systems.push({ key: 'stripe', name: 'Payments', vendor: 'Stripe', status: 'operational', lastChecked: checkedAt })
        } catch {
          systems.push({ key: 'stripe', name: 'Payments', vendor: 'Stripe', status: 'degraded', lastChecked: checkedAt })
        }
      } else {
        systems.push({ key: 'stripe', name: 'Payments', vendor: 'Stripe', status: 'not_configured', lastChecked: checkedAt })
      }

      // Wave
      const waveKey = process.env.WAVE_API_TOKEN
      if (waveKey) {
        try {
          const wRes = await fetch('https://gql.waveapps.com/graphql/public', { method: 'POST', headers: { 'Authorization': `Bearer ${waveKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: '{ user { defaultEmail } }' }) })
          systems.push({ key: 'wave', name: 'Accounting', vendor: 'Wave', status: wRes.ok ? 'operational' : 'degraded', lastChecked: checkedAt })
        } catch {
          systems.push({ key: 'wave', name: 'Accounting', vendor: 'Wave', status: 'degraded', lastChecked: checkedAt })
        }
      } else {
        systems.push({ key: 'wave', name: 'Accounting', vendor: 'Wave', status: 'not_configured', lastChecked: checkedAt })
      }

      // GoHighLevel
      const ghlKey = process.env.GHL_API_KEY
      const ghlLocation = process.env.GHL_LOCATION_ID
      if (ghlKey && ghlLocation) {
        try {
          const gRes = await fetch(`https://services.leadconnectorhq.com/opportunities/search?location_id=${encodeURIComponent(ghlLocation)}&limit=1&page=1`, { headers: { 'Authorization': `Bearer ${ghlKey}`, 'Version': '2021-07-28' } })
          systems.push({ key: 'ghl', name: 'CRM', vendor: 'GoHighLevel', status: gRes.ok ? 'operational' : 'degraded', detail: gRes.ok ? undefined : `HTTP ${gRes.status}`, lastChecked: checkedAt })
        } catch {
          systems.push({ key: 'ghl', name: 'CRM', vendor: 'GoHighLevel', status: 'degraded', lastChecked: checkedAt })
        }
      } else {
        systems.push({ key: 'ghl', name: 'CRM', vendor: 'GoHighLevel', status: 'not_configured', lastChecked: checkedAt })
      }

      // Fireflies
      const ffKey = process.env.FIREFLIES_API_KEY
      if (ffKey) {
        try {
          const ffRes = await fetch('https://api.fireflies.ai/graphql', { method: 'POST', headers: { 'Authorization': `Bearer ${ffKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: '{ user { email } }' }) })
          const ffJson: any = await ffRes.json()
          systems.push({ key: 'fireflies', name: 'Call Notes', vendor: 'Fireflies', status: ffRes.ok && !ffJson.errors ? 'operational' : 'degraded', lastChecked: checkedAt })
        } catch {
          systems.push({ key: 'fireflies', name: 'Call Notes', vendor: 'Fireflies', status: 'degraded', lastChecked: checkedAt })
        }
      } else {
        systems.push({ key: 'fireflies', name: 'Call Notes', vendor: 'Fireflies', status: 'not_configured', lastChecked: checkedAt })
      }

      // Calendar cache. A database query alone does not prove Google Calendar works.
      try {
        const { data, error } = await supabase.from('calls_cache').select('payload').eq('id',1).single()
        const generatedAt = data?.payload?.generated_at
        const age = generatedAt ? Date.now() - new Date(generatedAt).getTime() : Infinity
        const fresh = !error && age < 24 * 60 * 60 * 1000
        systems.push({ key: 'calendar', name: 'Calendar', vendor: 'Google Calendar', status: fresh ? 'operational' : 'degraded', detail: generatedAt ? `Cache updated ${generatedAt}` : 'No calendar sync data', lastChecked: checkedAt })
      } catch {
        systems.push({ key: 'calendar', name: 'Calendar', vendor: 'Google Calendar', status: 'degraded', detail: 'Calendar cache unavailable', lastChecked: checkedAt })
      }

      const operational = systems.filter(s => s.status === 'operational').length
      const overall = systems.every(s => s.status === 'operational' || s.status === 'not_configured')
        ? 'operational'
        : systems.some(s => s.status === 'down')
        ? 'down'
        : 'degraded'

      return res.json({ overall, operational, total: systems.length, checkedAt, systems })
    }

    // GET /api/wave — Wave accounting summary
    if (path === 'wave' && method === 'GET') {
      const waveToken = process.env.WAVE_API_TOKEN
      const waveBusinessId = process.env.WAVE_BUSINESS_ID
      if (!waveToken || !waveBusinessId) return res.json({ enabled: false })
      try {
        const query = `query($businessId: ID!, $dateStart: Date!, $dateEnd: Date!, $lastStart: Date!, $lastEnd: Date!) {
          business(id: $businessId) {
            reports {
              profitAndLoss(dateRangeStart: $dateStart, dateRangeEnd: $dateEnd) { income { total { raw } } }
              lastMonth: profitAndLoss(dateRangeStart: $lastStart, dateRangeEnd: $lastEnd) { income { total { raw } } }
            }
          }
        }`
        const now = new Date()
        const y = now.getFullYear(), m = now.getMonth() + 1
        const dateStart = `${y}-${String(m).padStart(2,'0')}-01`
        const dateEnd = now.toISOString().split('T')[0]
        const lastM = m === 1 ? 12 : m - 1, lastY = m === 1 ? y - 1 : y
        const lastStart = `${lastY}-${String(lastM).padStart(2,'0')}-01`
        const lastEnd = `${y}-${String(m).padStart(2,'0')}-01`
        const wRes = await fetch('https://gql.waveapps.com/graphql/public', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${waveToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, variables: { businessId: waveBusinessId, dateStart, dateEnd, lastStart, lastEnd } })
        })
        const wJson: any = await wRes.json()
        if (wJson.errors) return res.json({ enabled: true, error: wJson.errors[0]?.message })
        const biz = wJson.data?.business
        return res.json({
          enabled: true,
          thisMonth: biz?.reports?.profitAndLoss?.income?.total?.raw || 0,
          lastMonth: biz?.reports?.lastMonth?.income?.total?.raw || 0,
        })
      } catch (err: any) {
        return res.json({ enabled: true, error: err.message })
      }
    }

    // GET /api/revenue-series — monthly revenue series for charts
    if (path === 'revenue-series' && method === 'GET') {
      const months = Number(req.query.months) || 6
      const since = new Date(); since.setMonth(since.getMonth() - months)
      const charges = await fetchAllCharges(since)
      const series: Record<string, number> = {}
      for (const c of charges) {
        const d = new Date(c.created * 1000)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        series[key] = (series[key] || 0) + c.amount / 100
      }
      const result = Object.entries(series).sort(([a], [b]) => a.localeCompare(b)).map(([month, revenue]) => ({ month, revenue }))
      return res.json(result)
    }

    // ── Task manager ──
    // GET /api/tasks?assignee=<name>
    if (path === 'tasks' && method === 'GET') {
      let q = supabase.from('tasks').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true })
      const assignee = typeof req.query.assignee === 'string' ? req.query.assignee : ''
      if (assignee) q = q.eq('assignee', assignee)
      const { data, error } = await q
      if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message || '')) {
          return res.status(503).json({ error: 'Task tables not set up yet', setupRequired: true })
        }
        throw error
      }
      return res.json((data || []).map((t: any) => ({ ...t, priority: taskPriority(t) })))
    }
    // POST /api/tasks
    if (path === 'tasks' && method === 'POST') {
      const b = req.body || {}
      const title = typeof b.title === 'string' ? b.title.trim() : ''
      if (!title) return res.status(400).json({ error: 'Title is required' })
      const row: any = {
        title,
        description: typeof b.description === 'string' ? b.description : null,
        assignee: typeof b.assignee === 'string' && b.assignee.trim() ? b.assignee.trim() : null,
        priority: ['low', 'medium', 'high', 'none'].includes(b.priority) ? b.priority : 'none',
        due_date: typeof b.due_date === 'string' && b.due_date ? b.due_date : null,
        status: ['todo', 'in_progress', 'done', 'reminder'].includes(b.status) ? b.status : 'todo',
      }
      if (row.due_date && row.status !== 'done') row.priority = autoPriority(row.due_date)
      const { data, error } = await supabase.from('tasks').insert(row).select().single()
      if (error) throw error
      const bits = [row.assignee ? `→ ${row.assignee}` : '→ Team', row.due_date ? `due ${row.due_date}` : null].filter(Boolean).join(', ')
      if (data.priority === 'high' && data.assignee) {
        await notifySlack(`🔥 New HIGH priority task for *${data.assignee}*: *${data.title}* (due ${data.due_date})`)
      } else {
        await notifySlack(`📋 New task: *${data.title}* (${bits})`)
      }
      if (data.assignee) {
        await slackDM(data.assignee, `📋 New task assigned to you: *${data.title}*${data.due_date ? ` — due ${data.due_date}` : ''}${data.priority === 'high' ? ' 🔥 HIGH priority' : ''}`)
      }
      return res.json(data)
    }
    // PATCH /api/tasks  { id, ...fields }
    if (path === 'tasks' && method === 'PATCH') {
      const b = req.body || {}
      const id = Number(b.id)
      if (!id) return res.status(400).json({ error: 'Task id is required' })
      const updates: any = { updated_at: new Date().toISOString() }
      if (typeof b.title === 'string' && b.title.trim()) updates.title = b.title.trim()
      if (typeof b.description === 'string' || b.description === null) updates.description = b.description
      if (typeof b.assignee === 'string' || b.assignee === null) updates.assignee = b.assignee || null
      if (['low', 'medium', 'high', 'none'].includes(b.priority)) updates.priority = b.priority
      if (typeof b.due_date === 'string' || b.due_date === null) updates.due_date = b.due_date || null
      if (typeof b.sort_order === 'number') updates.sort_order = b.sort_order
      if (['todo', 'in_progress', 'done', 'reminder'].includes(b.status)) {
        updates.status = b.status
        updates.completed_at = b.status === 'done' ? new Date().toISOString() : null
      }
      const { data, error } = await supabase.from('tasks').update(updates).eq('id', id).select().single()
      if (error) {
        if (error.code === 'PGRST116') return res.status(404).json({ error: 'Task not found' })
        throw error
      }
      // Due date set/changed/cleared → priority follows the automatic rules
      if (updates.due_date !== undefined && data.status !== 'done') {
        const p = autoPriority(data.due_date || '')
        if (p !== data.priority) {
          await supabase.from('tasks').update({ priority: p }).eq('id', id)
          data.priority = p
        }
      }
      if (updates.status === 'done') {
        await notifySlack(`✅ Done: *${data.title}*${data.assignee ? ` — ${data.assignee}` : ''}`)
      } else if (data.priority === 'high' && data.assignee && (updates.assignee !== undefined || updates.due_date)) {
        await notifySlack(`🔥 HIGH priority task for *${data.assignee}*: *${data.title}* (due ${data.due_date})`)
        await slackDM(data.assignee, `🔥 HIGH priority task for you: *${data.title}* — due ${data.due_date}.`)
      } else if (updates.assignee && data.assignee) {
        await slackDM(data.assignee, `📋 Task assigned to you: *${data.title}*${data.due_date ? ` — due ${data.due_date}` : ''}`)
      }
      return res.json(data)
    }
    // DELETE /api/tasks?id=
    if (path === 'tasks' && method === 'DELETE') {
      const id = Number(req.query.id)
      if (!id) return res.status(400).json({ error: 'Task id is required' })
      const { error } = await supabase.from('tasks').delete().eq('id', id)
      if (error) throw error
      return res.json({ ok: true })
    }

    // GET /api/team-documents
    if (path === 'team-documents' && method === 'GET') {
      const { data, error } = await supabase.from('team_documents').select('*').order('created_at', { ascending: false })
      if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message || '')) {
          return res.status(503).json({ error: 'Document table not set up yet', setupRequired: true })
        }
        throw error
      }
      return res.json(data || [])
    }
    // POST /api/team-documents  { title, url?, content? }
    if (path === 'team-documents' && method === 'POST') {
      const b = req.body || {}
      const title = typeof b.title === 'string' ? b.title.trim() : ''
      if (!title) return res.status(400).json({ error: 'Title is required' })
      const row = {
        title,
        url: typeof b.url === 'string' && b.url.trim() ? b.url.trim() : null,
        content: typeof b.content === 'string' && b.content.trim() ? b.content.trim() : null,
      }
      let { data, error } = await supabase.from('team_documents').insert(row).select().single()
      // Older tables may not have the content column yet — save without it rather than fail
      if (error && /'content' column/i.test(error.message || '')) {
        ;({ data, error } = await supabase.from('team_documents').insert({ title: row.title, url: row.url }).select().single())
      }
      if (error) throw error
      return res.json(data)
    }
    // DELETE /api/team-documents?id=
    if (path === 'team-documents' && method === 'DELETE') {
      const id = Number(req.query.id)
      if (!id) return res.status(400).json({ error: 'Document id is required' })
      const { error } = await supabase.from('team_documents').delete().eq('id', id)
      if (error) throw error
      return res.json({ ok: true })
    }

    // GET /api/team-members
    if (path === 'team-members' && method === 'GET') {
      const { data, error } = await supabase.from('team_members').select('*').order('name', { ascending: true })
      if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message || '')) {
          return res.status(503).json({ error: 'Task tables not set up yet', setupRequired: true })
        }
        throw error
      }
      return res.json(data || [])
    }
    // POST /api/team-members  { name }
    if (path === 'team-members' && method === 'POST') {
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
      if (!name) return res.status(400).json({ error: 'Name is required' })
      const { data, error } = await supabase.from('team_members').insert({ name }).select().single()
      if (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'That person is already on the team' })
        throw error
      }
      return res.json(data)
    }
    // DELETE /api/team-members?id=
    if (path === 'team-members' && method === 'DELETE') {
      const id = Number(req.query.id)
      if (!id) return res.status(400).json({ error: 'Member id is required' })
      const { data: member, error: findErr } = await supabase.from('team_members').select('name').eq('id', id).single()
      if (findErr) {
        if (findErr.code === 'PGRST116') return res.status(404).json({ error: 'Member not found' })
        throw findErr
      }
      // Their tasks move back to the Team board instead of becoming unreachable
      await supabase.from('tasks').update({ assignee: null }).eq('assignee', member.name)
      const { error } = await supabase.from('team_members').delete().eq('id', id)
      if (error) throw error
      return res.json({ ok: true })
    }

    res.status(404).json({ error:'Not found', debug: { path, slug, rawRoute, url: req.url } })
  } catch (err:any) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
