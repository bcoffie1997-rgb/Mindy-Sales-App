import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_lib/supabase'
import { getStripe, fetchAllCharges, matchStripeToLead } from './_lib/stripe'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!getStripe()) return res.json({ enabled: false })

  try {
    const now = new Date()
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 12, 1)
    const [allCharges, { data: allLeads }] = await Promise.all([
      fetchAllCharges(twelveMonthsAgo),
      supabase.from('leads').select('id, name, email, type, score, client_tier, status')
    ])

    const q = ((req.query.q as string) || '').toLowerCase()
    const transactions = allCharges.map((c: any) => {
      const email = c.billing_details?.email || c.receipt_email || ''
      const name = c.billing_details?.name || ''
      const desc = c.description || c.metadata?.memberpress_product || c.metadata?.product || ''
      const match = matchStripeToLead(email, name, allLeads || [])
      return {
        id: c.id,
        amount: c.amount / 100,
        currency: c.currency,
        description: desc,
        customer_email: email,
        customer_name: name,
        date: new Date(c.created * 1000).toISOString(),
        client_match: match ? { id: match.id, name: match.name, type: match.type, score: match.score, client_tier: match.client_tier, status: match.status } : null,
        platform: c.metadata?.platform || c.metadata?.site_url || null
      }
    })

    const filtered = q
      ? transactions.filter(t =>
          t.customer_name.toLowerCase().includes(q) ||
          t.customer_email.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          (t.client_match?.name || '').toLowerCase().includes(q))
      : transactions

    res.json({ enabled: true, total: transactions.length, results: filtered })
  } catch (err: any) {
    res.status(500).json({ enabled: true, error: err.message })
  }
}
