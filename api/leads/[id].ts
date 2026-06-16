import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_lib/supabase'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { id } = req.query as { id: string }

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('leads').select('*').eq('id', id).single()
    if (error) return res.status(404).json({ error: 'Lead not found' })
    return res.json(data)
  }

  if (req.method === 'PATCH') {
    const updates = { ...req.body, last_action_date: new Date().toISOString() }
    const { data, error } = await supabase
      .from('leads')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) return res.status(404).json({ error: 'Lead not found' })
    return res.json(data)
  }

  res.status(405).end()
}
