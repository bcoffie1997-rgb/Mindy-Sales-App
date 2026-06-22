import type { Config } from '../config.js'

export interface FirefliesTranscript {
  id: string
  title: string
  date: string
  duration: number
  attendees: { email: string; name: string; phone?: string }[]
  summary: string
  action_items: string[]
  questions: string[]
  sentences: { speaker: string; text: string }[]
}

export class FirefliesClient {
  private apiKey: string
  private enabled = false

  constructor(config: Config) {
    this.apiKey = config?.integrations?.fireflies?.apiKey || ''
    this.enabled = !!this.apiKey
  }

  isEnabled() {
    return this.enabled
  }

  private async request(query: string, variables: Record<string, any> = {}) {
    if (!this.enabled) return null
    const res = await fetch('https://api.fireflies.ai/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ query, variables }),
    })
    if (!res.ok) {
      console.error('Fireflies API error:', res.status, await res.text())
      return null
    }
    return res.json()
  }

  async listTranscripts(since?: string, limit = 50): Promise<FirefliesTranscript[]> {
    const query = `
      query Transcripts($limit: Int) {
        transcripts(limit: $limit) {
          id
          title
          date
          duration
          summary {
            overview
            action_items
            questions_answered
          }
          participants {
            email
            name
            phone_number
          }
          sentences {
            speaker_name
            text
          }
        }
      }
    `
    const data: any = await this.request(query, { limit })
    const transcripts = data?.data?.transcripts || []

    return transcripts
      .filter((t: any) => !since || new Date(t.date) >= new Date(since))
      .map((t: any) => ({
        id: t.id,
        title: t.title,
        date: t.date,
        duration: t.duration,
        attendees: (t.participants || []).map((p: any) => ({
          email: p.email,
          name: p.name,
          phone: p.phone_number,
        })),
        summary: t.summary?.overview || '',
        action_items: t.summary?.action_items || [],
        questions: t.summary?.questions_answered || [],
        sentences: (t.sentences || []).map((s: any) => ({ speaker: s.speaker_name, text: s.text })),
      }))
  }
}
