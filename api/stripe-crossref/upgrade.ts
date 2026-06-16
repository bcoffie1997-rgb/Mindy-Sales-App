import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_lib/supabase'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { leadIds } = req.body
  if (!leadIds?.length) return res.status(400).json({ error: 'No leadIds provided' })

  try {
    const { data, error } = await supabase
      .from('leads')
      .update({
        type: 'client',
        status: 'paid',
        client_status: 'active',
        last_action: 'Upgraded to client via Stripe cross-reference',
        last_action_date: new Date().toISOString()
      })
      .in('id', leadIds)
      .neq('type', 'client')
      .select('id')

    if (error) throw error
    res.json({ upgraded: (data || []).length, total: leadIds.length })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}
