// @ts-nocheck — runtime-tested serverless handler; skip strict type-check at build
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

const AGENTS = ['gc-lead-intake','gc-email-responder','gc-appointment-setter','gc-post-call','gc-crm-morning','gc-crm-evening','gc-qa-health']
const PROPOSAL_KEYWORDS = ['proposal sent','proposal delivered','pricing sent','engagement letter','sent proposal','sent pricing','payment link']

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

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

  // Debug: return env var + connection status for /api/health
  if (path === 'health') {
    let dbCheck = 'not_attempted'
    if (supabaseReady) {
      try {
        const { error } = await supabase.from('leads').select('id').limit(1)
        dbCheck = error ? `query_error: ${error.message}` : 'connected'
      } catch (e: any) {
        dbCheck = `exception: ${e?.message || e}`
      }
    }
    return res.json({
      status: supabaseReady ? 'ok' : 'missing_or_bad_env',
      supabase_url_set: !!process.env.SUPABASE_URL,
      supabase_url_preview: supabaseUrlValue ? supabaseUrlValue.slice(0, 30) + '...' : '(empty)',
      supabase_key_set: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      stripe_key_set: !!process.env.STRIPE_SECRET_KEY,
      init_error: initError,
      db_check: dbCheck,
      env_keys: Object.keys(process.env).filter(k => k.includes('SUPA') || k.includes('STRIPE')).sort()
    })
  }
  const method = req.method || 'GET'

  try {
    // GET /api/stats
    if (path === 'stats') {
      const [{ data: all, error }, { data: events }] = await Promise.all([
        supabase.from('leads').select('*'),
        supabase.from('agent_events').select('agent_name,event_type,ts').eq('event_type','run_summary')
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
        const last = runs[runs.length-1]
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
        const { data, error } = await supabase.from('leads').select('*').eq('id',id).single()
        if (error) return res.status(404).json({ error:'Lead not found' })
        return res.json(data)
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
      return res.json(data||[])
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
      const [allCharges,{data:allLeads}] = await Promise.all([fetchAllCharges(twelveMonthsAgo),supabase.from('leads').select('id,name,email,type,score,client_tier')])
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
      const recentTransactions = allCharges.slice(0,30).map((c:any) => { const email=c.billing_details?.email||c.receipt_email||'', name=c.billing_details?.name||'', match=matchStripeToLead(email,name,allLeads||[]); return {id:c.id,amount:c.amount/100,currency:c.currency,description:c.description||c.metadata?.product||'Payment',customer_email:email,customer_name:name,date:new Date(c.created*1000).toISOString(),status:c.status,client_match:match?{id:match.id,name:match.name,type:match.type,score:match.score,client_tier:match.client_tier}:null,platform:c.metadata?.platform||null} })
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
      const [allCharges,activeSubs,{data:allLeads}] = await Promise.all([fetchAllCharges(twelveMonthsAgo),stripe.subscriptions.list({limit:100,status:'active'}),supabase.from('leads').select('id,name,email,type,client_tier,client_status')])
      const monthly:Record<string,{revenue:number;count:number}> = {}
      for (const c of allCharges) { const d=new Date(c.created*1000),key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); if(!monthly[key])monthly[key]={revenue:0,count:0}; monthly[key].revenue+=c.amount/100; monthly[key].count++ }
      let mrr=0; for (const s of activeSubs.data) { const item=s.items.data[0],amount=item?.price?.unit_amount?item.price.unit_amount/100:0,interval=item?.price?.recurring?.interval||'month'; mrr+=interval==='year'?amount/12:amount }
      const sortedMonths=Object.entries(monthly).sort(), currentMonth=sortedMonths[sortedMonths.length-1], prevMonth=sortedMonths[sortedMonths.length-2]
      const ytd=sortedMonths.filter(([k])=>k.startsWith(String(now.getFullYear()))).reduce((s,[,v])=>s+v.revenue,0)
      const customerTotals:Record<string,{name:string;email:string;total:number;count:number}> = {}
      for (const c of allCharges) { const email=c.billing_details?.email||c.receipt_email||'',name=c.billing_details?.name||email||'Unknown',key=email||name; if(!customerTotals[key])customerTotals[key]={name,email,total:0,count:0}; customerTotals[key].total+=c.amount/100; customerTotals[key].count++ }
      const topCustomers=Object.values(customerTotals).sort((a,b)=>b.total-a.total).slice(0,10)
      const growthData=sortedMonths.map(([month,data],i)=>({month,revenue:data.revenue,count:data.count,growth:i>0?((data.revenue-sortedMonths[i-1][1].revenue)/sortedMonths[i-1][1].revenue*100).toFixed(1)+'%':'N/A'}))
      return res.json({ enabled:true, report:{ generated:now.toISOString(), summary:{ thisMonth:currentMonth?{month:currentMonth[0],revenue:currentMonth[1].revenue,transactions:currentMonth[1].count}:null, lastMonth:prevMonth?{month:prevMonth[0],revenue:prevMonth[1].revenue,transactions:prevMonth[1].count}:null, ytd,mrr:Math.round(mrr*100)/100,activeSubscriptions:activeSubs.data.length,totalTransactions:allCharges.length,avgTransactionValue:allCharges.length>0?Math.round(allCharges.reduce((s,c)=>s+c.amount/100,0)/allCharges.length):0 }, monthlyTrend:growthData, topCustomers, clientMatches:topCustomers.map(tc=>{const match=matchStripeToLead(tc.email,tc.name,allLeads||[]);return{...tc,client_match:match?{name:match.name,type:match.type,tier:match.client_tier,status:match.client_status}:null}}) } })
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
      const [allCharges,{data:allLeads}]=await Promise.all([fetchAllCharges(twelveMonthsAgo),supabase.from('leads').select('id,name,email,type,score,client_tier,status')])
      const q=((req.query.q as string)||'').toLowerCase()
      const transactions=allCharges.map((c:any)=>{ const email=c.billing_details?.email||c.receipt_email||'',name=c.billing_details?.name||'',desc=c.description||c.metadata?.memberpress_product||c.metadata?.product||'',match=matchStripeToLead(email,name,allLeads||[]); return {id:c.id,amount:c.amount/100,currency:c.currency,description:desc,customer_email:email,customer_name:name,date:new Date(c.created*1000).toISOString(),client_match:match?{id:match.id,name:match.name,type:match.type,score:match.score,client_tier:match.client_tier,status:match.status}:null,platform:c.metadata?.platform||null} })
      const filtered=q?transactions.filter((t:any)=>t.customer_name.toLowerCase().includes(q)||t.customer_email.toLowerCase().includes(q)||t.description.toLowerCase().includes(q)||(t.client_match?.name||'').toLowerCase().includes(q)):transactions
      return res.json({ enabled:true,total:transactions.length,results:filtered })
    }

    // POST or GET /api/seed-from-stripe?key=govcon-seed
    // One-time: reconstruct client roster from Stripe payers into Supabase
    if (path === 'seed-from-stripe') {
      if ((req.query.key as string) !== 'govcon-seed') return res.status(403).json({ error: 'Forbidden — add ?key=govcon-seed' })
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

    // GET or POST /api/sync-ghl?key=govcon-seed[&page=N][&pages=M]
    // Opportunity-driven, RESUMABLE lead import from GoHighLevel → Supabase leads table.
    // The account has ~20k contacts but only ~2k opportunities (the real pipeline), so we
    // import leads from opportunities. Each call processes a bounded number of opportunity
    // pages within a ~22s time budget, then returns nextPage so it can be called repeatedly
    // until done — this keeps every invocation safely under the 30s serverless limit.
    if (path === 'sync-ghl') {
      if ((req.query.key as string) !== 'govcon-seed') return res.status(403).json({ error: 'Forbidden — add ?key=govcon-seed' })

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
        if (s.includes('sold') || s.includes('won') || s.includes('closed')) return { score: 'hot', status: 'paid' }
        if (s.includes('proposal') || s.includes('contract') || s.includes('payment') || s.includes('closing')) return { score: 'hot', status: 'proposal_sent' }
        if (s.includes('missed')) return { score: 'warm', status: 'no_show' }
        if (s.includes('meeting') || s.includes('call') || s.includes('schedule') || s.includes('webinar') || s.includes('bid')) return { score: 'hot', status: 'call_scheduled' }
        if (s.includes('follow')) return { score: 'warm', status: 'follow_up' }
        if (s.includes('lost') || s.includes('dead') || s.includes('disqualified')) return { score: 'cold', status: 'dead' }
        return { score: 'warm', status: 'new' }
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
          : `Not finished — call again with ?key=govcon-seed&page=${page}`
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

    // GET or POST /api/sync-fireflies?key=govcon-seed
    // Pull call transcripts + summaries from Fireflies → Supabase transcripts table
    if (path === 'sync-fireflies') {
      if ((req.query.key as string) !== 'govcon-seed') return res.status(403).json({ error: 'Forbidden — add ?key=govcon-seed' })

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
      const { data: allLeads } = await supabase.from('leads').select('id,name,email')
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

    res.status(404).json({ error:'Not found', debug: { path, slug, rawRoute, url: req.url } })
  } catch (err:any) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
