import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_lib/supabase'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const { error } = await supabase.from('leads').select('id').limit(1)
  res.json({ status: error ? 'degraded' : 'ok', db: error ? error.message : 'connected' })
}
