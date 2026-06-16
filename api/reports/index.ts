import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_lib/supabase'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const { data, error } = await supabase
      .from('reports')
      .select('filename, category')
      .order('filename', { ascending: false })

    if (error) throw error

    const daily = (data || []).filter(r => r.category === 'daily').map(r => r.filename)
    const weekly = (data || []).filter(r => r.category === 'weekly').map(r => r.filename)
    res.json({ daily, weekly })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}
