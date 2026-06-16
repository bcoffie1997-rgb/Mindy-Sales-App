import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getStripe, matchStripeToLead } from './_lib/stripe'
import { supabase } from './_lib/supabase'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const stripe = getStripe()
  if (!stripe) return res.json({ enabled: false })

  try {
    const [{ data: allLeads }, activeSubs, pastDueSubs] = await Promise.all([
      supabase.from('leads').select('id, name, email, type, client_tier'),
      stripe.subscriptions.list({ limit: 100, status: 'active', expand: ['data.customer'] }),
      stripe.subscriptions.list({ limit: 100, status: 'past_due', expand: ['data.customer'] })
    ])

    const allSubs = [...activeSubs.data, ...pastDueSubs.data]

    const productIds = [...new Set(allSubs.map(s => s.items.data[0]?.price?.product as string).filter(Boolean))]
    const productNames: Record<string, string> = {}
    for (let i = 0; i < productIds.length; i += 10) {
      await Promise.all(productIds.slice(i, i + 10).map(async (pid) => {
        try { const p = await stripe!.products.retrieve(pid); productNames[pid] = p.name } catch { productNames[pid] = pid }
      }))
    }

    const planGroups: Record<string, { name: string; price: number; interval: string; members: any[]; mrr: number }> = {}
    let totalMrr = 0

    const subscriptions = allSubs.map((s) => {
      const item = s.items.data[0]
      const amount = item?.price?.unit_amount ? item.price.unit_amount / 100 : 0
      const interval = item?.price?.recurring?.interval || 'month'
      const prodId = item?.price?.product as string
      const productName = productNames[prodId] || prodId || 'Unknown'

      let monthlyAmount = amount
      if (interval === 'year') monthlyAmount = amount / 12
      if (s.status === 'active') totalMrr += monthlyAmount

      const custObj = s.customer
      const custEmail = (typeof custObj === 'object' && custObj !== null && !(custObj as any).deleted) ? (custObj as any).email || '' : ''
      const custName = (typeof custObj === 'object' && custObj !== null && !(custObj as any).deleted) ? (custObj as any).name || '' : ''
      const match = matchStripeToLead(custEmail, custName, allLeads || [])

      let tierName: string, tierOrder: number
      if (amount === 9) { tierName = 'Community Plan'; tierOrder = 1 }
      else if (amount === 27) { tierName = 'Starter Plan'; tierOrder = 2 }
      else if (amount === 99) { tierName = 'Pro Member Group'; tierOrder = 3 }
      else if (amount === 249) { tierName = 'Ongoing Coaching'; tierOrder = 4 }
      else if (amount === 497) { tierName = 'Market Intelligence'; tierOrder = 5 }
      else if (interval === 'year' && amount <= 999) { tierName = 'Pro Member (Annual)'; tierOrder = 6 }
      else if (interval === 'year' && amount > 999) { tierName = 'Pro Member Lifetime'; tierOrder = 7 }
      else if (amount >= 4000) { tierName = 'White Glove BD'; tierOrder = 8 }
      else { tierName = productName; tierOrder = 9 }

      const groupKey = `${tierOrder}__${tierName}`
      if (!planGroups[groupKey]) planGroups[groupKey] = { name: tierName, price: amount, interval, members: [], mrr: 0 }
      planGroups[groupKey].members.push({ name: custName || custEmail || s.id, email: custEmail, status: s.status, client_match: match?.name || null })
      if (s.status === 'active') planGroups[groupKey].mrr += monthlyAmount

      let periodEnd: string | null = null
      try {
        const raw = (s as any).current_period_end
        if (typeof raw === 'number') periodEnd = new Date(raw * 1000).toISOString()
      } catch {}

      return {
        id: s.id,
        customer_name: custName,
        customer_email: custEmail,
        status: s.status,
        amount,
        interval,
        product: productName,
        current_period_end: periodEnd,
        client_match: match ? { id: match.id, name: match.name, type: match.type, client_tier: match.client_tier } : null
      }
    })

    res.json({
      enabled: true,
      mrr: Math.round(totalMrr * 100) / 100,
      activeCount: activeSubs.data.length,
      pastDueCount: pastDueSubs.data.length,
      subscriptions,
      planGroups: Object.entries(planGroups).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v)
    })
  } catch (err: any) {
    res.status(500).json({ enabled: true, error: err.message })
  }
}
