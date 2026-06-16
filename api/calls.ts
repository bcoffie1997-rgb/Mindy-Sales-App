import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_lib/supabase'

const EMPTY = { today: [], tomorrow: [], this_week: [], generated_at: null }

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const { data, error } = await supabase
      .from('calls_cache')
      .select('payload, generated_at')
      .eq('id', 1)
      .single()

    if (error || !data) return res.json(EMPTY)
    res.json(data.payload || EMPTY)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}
