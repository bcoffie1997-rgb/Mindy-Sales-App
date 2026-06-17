import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase, supabaseReady, initError, supabaseUrlValue } from './_lib/supabase'
import { getStripe, fetchAllCharges, matchStripeToLead } from './_lib/stripe'

const AGENTS = ['gc-lead-intake','gc-email-responder','gc-appointment-setter','gc-post-call','gc-crm-morning','gc-crm-evening','gc-qa-health']
const PROPOSAL_KEYWORDS = ['proposal sent','proposal delivered','pricing sent','engagement letter','sent proposal','sent pricing','payment link']

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const slug = (req.query.route as string[]) || []
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
      return res.json({ daily:(data||[]).filter(r=>r.category==='daily').map(r=>r.filename), weekly:(data||[]).filter(r=>r.category==='weekly').map(r=>r.filename) })
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

    res.status(404).json({ error:'Not found' })
  } catch (err:any) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
