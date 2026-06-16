import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_lib/supabase'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const hours = Number(req.query.hours) || 24
    const cutoff = new Date(Date.now() - hours * 3600000).toISOString()

    const { data, error } = await supabase
      .from('agent_events')
      .select('*')
      .gte('ts', cutoff)
      .order('ts', { ascending: false })
      .limit(200)

    if (error) throw error
    res.json(data || [])
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}
