import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getStripe, fetchAllCharges, matchStripeToLead } from '../_lib/stripe'
import { supabase } from '../_lib/supabase'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  if (!getStripe()) return res.json({ enabled: false })

  try {
    const now = new Date()
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 12, 1)

    const [allCharges, { data: allLeads }] = await Promise.all([
      fetchAllCharges(twelveMonthsAgo),
      supabase.from('leads').select('id, name, email, type, score, status, client_tier')
    ])

    const payers: Record<string, { name: string; email: string; total: number; count: number; lastPayment: string }> = {}
    for (const c of allCharges) {
      const email = (c.billing_details?.email || c.receipt_email || '').toLowerCase()
      const name = c.billing_details?.name || ''
      const key = email || name.toLowerCase()
      if (!key) continue
      if (!payers[key]) payers[key] = { name, email, total: 0, count: 0, lastPayment: '' }
      payers[key].total += c.amount / 100
      payers[key].count++
      const dt = new Date(c.created * 1000).toISOString()
      if (dt > payers[key].lastPayment) payers[key].lastPayment = dt
      if (name && !payers[key].name) payers[key].name = name
    }

    const missingClients: any[] = []
    const matchedAsLead: any[] = []
    const matchedAsClient: any[] = []

    for (const payer of Object.values(payers)) {
      const match = matchStripeToLead(payer.email, payer.name, allLeads || [])
      if (!match) {
        missingClients.push({ ...payer, status: 'not_in_crm' })
      } else if (match.type !== 'client') {
        matchedAsLead.push({ ...payer, lead: { id: match.id, name: match.name, score: match.score, status: match.status } })
      } else {
        matchedAsClient.push({ ...payer, client: { id: match.id, name: match.name, tier: match.client_tier } })
      }
    }

    res.json({
      enabled: true,
      summary: {
        totalPayers: Object.keys(payers).length,
        matchedAsClient: matchedAsClient.length,
        matchedAsLead: matchedAsLead.length,
        notInCrm: missingClients.length
      },
      needsUpgrade: matchedAsLead.sort((a, b) => b.total - a.total),
      missingFromCrm: missingClients.sort((a, b) => b.total - a.total),
      confirmedClients: matchedAsClient.sort((a, b) => b.total - a.total)
    })
  } catch (err: any) {
    res.status(500).json({ enabled: true, error: err.message })
  }
}
