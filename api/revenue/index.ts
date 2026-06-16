import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_lib/supabase'
import { getStripe, fetchAllCharges, matchStripeToLead } from '../_lib/stripe'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  if (!getStripe()) return res.json({ enabled: false })

  try {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 12, 1)

    const [allCharges, { data: allLeads }] = await Promise.all([
      fetchAllCharges(twelveMonthsAgo),
      supabase.from('leads').select('id, name, email, type, score, client_tier')
    ])

    const monthlyRevenue: Record<string, { revenue: number; count: number }> = {}
    for (const c of allCharges) {
      const d = new Date(c.created * 1000)
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
      if (!monthlyRevenue[key]) monthlyRevenue[key] = { revenue: 0, count: 0 }
      monthlyRevenue[key].revenue += c.amount / 100
      monthlyRevenue[key].count++
    }

    const thisMonthKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')
    const lastMonthKey = startOfLastMonth.getFullYear() + '-' + String(startOfLastMonth.getMonth() + 1).padStart(2, '0')
    const thisMonth = monthlyRevenue[thisMonthKey]?.revenue || 0
    const lastMonth = monthlyRevenue[lastMonthKey]?.revenue || 0
    const yearStart = now.getFullYear() + '-01'
    const ytd = Object.entries(monthlyRevenue).filter(([k]) => k >= yearStart).reduce((s, [, v]) => s + v.revenue, 0)

    const thisMonthCharges = allCharges.filter(c => c.created >= Math.floor(startOfMonth.getTime() / 1000))
    const dailyRevenue: Record<string, number> = {}
    for (const c of thisMonthCharges) {
      const day = new Date(c.created * 1000).toISOString().slice(0, 10)
      dailyRevenue[day] = (dailyRevenue[day] || 0) + c.amount / 100
    }

    const recentTransactions = allCharges.slice(0, 30).map((c: any) => {
      const email = c.billing_details?.email || c.receipt_email || ''
      const name = c.billing_details?.name || ''
      const match = matchStripeToLead(email, name, allLeads || [])
      return {
        id: c.id,
        amount: c.amount / 100,
        currency: c.currency,
        description: c.description || c.metadata?.product || c.metadata?.memberpress_product || 'Payment',
        customer_email: email,
        customer_name: name,
        date: new Date(c.created * 1000).toISOString(),
        status: c.status,
        client_match: match ? { id: match.id, name: match.name, type: match.type, score: match.score, client_tier: match.client_tier } : null,
        platform: c.metadata?.platform || c.metadata?.site_url || null
      }
    })

    const productGroups: Record<string, { name: string; count: number; total: number; customers: string[] }> = {}
    for (const c of allCharges) {
      const rawDesc = c.description || c.metadata?.memberpress_product || c.metadata?.product || 'Other'
      let group = rawDesc
      if (/subscription (update|creation)/i.test(rawDesc)) group = 'Mighty Networks / Subscription'
      else if (/ai tools.*crm.*research/i.test(rawDesc)) group = 'AI Tools + CRM + Research'
      else if (/ai tools/i.test(rawDesc)) group = 'AI Tools'
      if (!productGroups[group]) productGroups[group] = { name: group, count: 0, total: 0, customers: [] }
      productGroups[group].count++
      productGroups[group].total += c.amount / 100
      const custName = c.billing_details?.name || c.receipt_email || 'Unknown'
      if (!productGroups[group].customers.includes(custName)) productGroups[group].customers.push(custName)
    }

    const mom = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth * 100).toFixed(1) : null

    res.json({
      enabled: true,
      thisMonth,
      lastMonth,
      ytd,
      transactionCount: thisMonthCharges.length,
      totalCharges: allCharges.length,
      recentTransactions,
      dailyRevenue,
      monthlyRevenue: Object.entries(monthlyRevenue).sort().map(([month, data]) => ({ month, ...data })),
      productGroups: Object.values(productGroups).sort((a, b) => b.total - a.total),
      monthOverMonth: mom
    })
  } catch (err: any) {
    res.status(500).json({ enabled: true, error: err.message })
  }
}
