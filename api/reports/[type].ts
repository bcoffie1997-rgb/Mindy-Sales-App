import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_lib/supabase'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const type = req.query.type as string
    const date = (req.query.date as string) || new Date().toISOString().slice(0, 10)
    const filename = `${date}-${type}.md`

    const { data, error } = await supabase
      .from('reports')
      .select('content, report_date, report_type')
      .eq('filename', filename)
      .single()

    if (error || !data) return res.status(404).json({ error: 'Report not found' })
    res.json({ date, type, content: data.content })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}
