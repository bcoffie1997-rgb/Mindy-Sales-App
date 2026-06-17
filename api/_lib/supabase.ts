import { createClient, SupabaseClient } from '@supabase/supabase-js'

const url = (process.env.SUPABASE_URL || '').trim()
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

export let initError: string | null = null
let client: SupabaseClient

try {
  client = createClient(url || 'https://placeholder.supabase.co', key || 'placeholder', {
    auth: { persistSession: false }
  })
} catch (err: any) {
  initError = err?.message || String(err)
  // Fall back to a placeholder client so module import never crashes
  client = createClient('https://placeholder.supabase.co', 'placeholder', {
    auth: { persistSession: false }
  })
}

export const supabase = client
export const supabaseReady = !!(url && key) && !initError
export const supabaseUrlValue = url
