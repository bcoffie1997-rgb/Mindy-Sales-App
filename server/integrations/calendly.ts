import type { Config } from '../config.js'

export interface CalendlyEvent {
  id: string
  name: string
  status: string
  start_time: string
  end_time: string
  location: string
  invitees: { email: string; name: string; status: string }[]
}

export class CalendlyClient {
  private token: string
  private enabled = false

  constructor(config: Config) {
    this.token = config?.integrations?.calendly?.apiToken || ''
    this.enabled = !!this.token
  }

  isEnabled() {
    return this.enabled
  }

  private async request(path: string, options: RequestInit = {}) {
    if (!this.enabled) return null
    const res = await fetch(`https://api.calendly.com${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    })
    if (!res.ok) {
      console.error('Calendly API error:', res.status, await res.text())
      return null
    }
    return res.json()
  }

  async getCurrentUserUri(): Promise<string | null> {
    const data: any = await this.request('/users/me')
    return data?.resource?.uri || null
  }

  async listScheduledEvents(minStartTime?: string, maxStartTime?: string): Promise<CalendlyEvent[]> {
    const userUri = await this.getCurrentUserUri()
    if (!userUri) return []

    const params = new URLSearchParams({ user: userUri, status: 'active', count: '100' })
    if (minStartTime) params.set('min_start_time', minStartTime)
    if (maxStartTime) params.set('max_start_time', maxStartTime)

    const data: any = await this.request(`/scheduled_events?${params.toString()}`)
    const events = data?.collection || []
    const results: CalendlyEvent[] = []

    for (const evt of events) {
      const invitees: any = await this.request(`/scheduled_events/${evt.uri.split('/').pop()}/invitees`)
      results.push({
        id: evt.uri,
        name: evt.name,
        status: evt.status,
        start_time: evt.start_time,
        end_time: evt.end_time,
        location: evt.location?.type === 'physical' ? evt.location.location : evt.location?.join_url || '',
        invitees: (invitees?.collection || []).map((i: any) => ({
          email: i.email,
          name: i.name,
          status: i.status,
        })),
      })
    }

    return results
  }
}
