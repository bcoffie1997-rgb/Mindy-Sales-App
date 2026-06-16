import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getStripe, fetchAllCharges, matchStripeToLead } from '../_lib/stripe'
import { supabase } from '../_lib/supabase'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const stripe = getStripe()
  if (!stripe) return res.json({ enabled: false })

  try {
    const now = new Date()
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 12, 1)

    const [allCharges, activeSubs, { data: allLeads }] = await Promise.all([
      fetchAllCharges(twelveMonthsAgo),
      stripe.subscriptions.list({ limit: 100, status: 'active' }),
      supabase.from('leads').select('id, name, email, type, client_tier, client_status')
    ])

    const monthly: Record<string, { revenue: number; count: number }> = {}
    for (const c of allCharges) {
      const d = new Date(c.created * 1000)
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
      if (!monthly[key]) monthly[key] = { revenue: 0, count: 0 }
      monthly[key].revenue += c.amount / 100
      monthly[key].count++
    }

    let mrr = 0
    for (const s of activeSubs.data) {
      const item = s.items.data[0]
      const amount = item?.price?.unit_amount ? item.price.unit_amount / 100 : 0
      const interval = item?.price?.recurring?.interval || 'month'
      mrr += interval === 'year' ? amount / 12 : amount
    }

    const sortedMonths = Object.entries(monthly).sort()
    const currentMonth = sortedMonths[sortedMonths.length - 1]
    const prevMonth = sortedMonths[sortedMonths.length - 2]
    const ytd = sortedMonths
      .filter(([k]) => k.startsWith(String(now.getFullYear())))
      .reduce((s, [, v]) => s + v.revenue, 0)

    const customerTotals: Record<string, { name: string; email: string; total: number; count: number }> = {}
    for (const c of allCharges) {
      const email = c.billing_details?.email || c.receipt_email || ''
      const name = c.billing_details?.name || email || 'Unknown'
      const key = email || name
      if (!customerTotals[key]) customerTotals[key] = { name, email, total: 0, count: 0 }
      customerTotals[key].total += c.amount / 100
      customerTotals[key].count++
    }

    const topCustomers = Object.values(customerTotals).sort((a, b) => b.total - a.total).slice(0, 10)

    const growthData = sortedMonths.map(([month, data], i) => {
      const prev = i > 0 ? sortedMonths[i - 1][1].revenue : 0
      return {
        month,
        revenue: data.revenue,
        count: data.count,
        growth: prev > 0 ? ((data.revenue - prev) / prev * 100).toFixed(1) + '%' : 'N/A'
      }
    })

    const report = {
      generated: now.toISOString(),
      summary: {
        thisMonth: currentMonth ? { month: currentMonth[0], revenue: currentMonth[1].revenue, transactions: currentMonth[1].count } : null,
        lastMonth: prevMonth ? { month: prevMonth[0], revenue: prevMonth[1].revenue, transactions: prevMonth[1].count } : null,
        ytd,
        mrr: Math.round(mrr * 100) / 100,
        activeSubscriptions: activeSubs.data.length,
        totalTransactions: allCharges.length,
        avgTransactionValue: allCharges.length > 0
          ? Math.round(allCharges.reduce((s, c) => s + c.amount / 100, 0) / allCharges.length) : 0
      },
      monthlyTrend: growthData,
      topCustomers,
      clientMatches: topCustomers.map(tc => {
        const match = matchStripeToLead(tc.email, tc.name, allLeads || [])
        return {
          ...tc,
          client_match: match ? { name: match.name, type: match.type, tier: match.client_tier, status: match.client_status } : null
        }
      })
    }

    res.json({ enabled: true, report })
  } catch (err: any) {
    res.status(500).json({ enabled: true, error: err.message })
  }
}
