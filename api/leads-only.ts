import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_lib/supabase'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .neq('type', 'client')
      .order('created_at', { ascending: false })
    if (error) throw error
    res.json(data || [])
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}
