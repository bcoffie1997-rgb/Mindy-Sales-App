import Stripe from 'stripe'
import { supabase } from './supabase'

const CACHE_TTL_MS = 30 * 60 * 1000

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  return new Stripe(key, { telemetry: false })
}

export async function fetchAllCharges(since: Date): Promise<any[]> {
  const stripe = getStripe()
  if (!stripe) return []

  // Check Supabase cache
  const { data: cached } = await supabase
    .from('stripe_cache')
    .select('data, fetched_at')
    .eq('id', 1)
    .single()

  if (cached && (Date.now() - new Date(cached.fetched_at).getTime()) < CACHE_TTL_MS) {
    const cutoff = Math.floor(since.getTime() / 1000)
    return (cached.data as any[]).filter(c => c.created >= cutoff)
  }

  // Fetch from Stripe (12 months of charges)
  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)

  const allCharges: any[] = []
  let hasMore = true
  let startingAfter: string | undefined

  while (hasMore) {
    const params: any = {
      limit: 100,
      created: { gte: Math.floor(twelveMonthsAgo.getTime() / 1000) }
    }
    if (startingAfter) params.starting_after = startingAfter
    const batch = await stripe.charges.list(params)
    allCharges.push(...batch.data.filter((c: any) => c.status === 'succeeded'))
    hasMore = batch.has_more
    if (batch.data.length > 0) startingAfter = batch.data[batch.data.length - 1].id
  }

  // Save to cache
  await supabase.from('stripe_cache').upsert({
    id: 1,
    data: allCharges,
    fetched_at: new Date().toISOString()
  })

  const cutoff = Math.floor(since.getTime() / 1000)
  return allCharges.filter(c => c.created >= cutoff)
}

export function matchStripeToLead(email: string, name: string, leads: any[]): any | null {
  if (!email && !name) return null
  const emailLower = (email || '').toLowerCase()
  const nameLower = (name || '').toLowerCase()
  return leads.find((l: any) => {
    if (emailLower && l.email && l.email.toLowerCase() === emailLower) return true
    if (nameLower && l.name && l.name.toLowerCase() === nameLower) return true
    return false
  }) || null
}
