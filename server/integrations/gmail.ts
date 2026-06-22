import { google, gmail_v1 } from 'googleapis'
import fs from 'fs'
import type { Config } from '../config.js'

export interface EmailMessage {
  id: string
  threadId: string
  from: string
  to: string
  subject: string
  date: string
  body: string
  labels: string[]
}

export class GmailClient {
  private auth: any
  private gmail: gmail_v1.Gmail | null = null
  private enabled = false

  constructor(config: Config) {
    const gmailConfig = config?.integrations?.gmail
    if (gmailConfig?.serviceAccountJson && fs.existsSync(gmailConfig.serviceAccountJson)) {
      const key = JSON.parse(fs.readFileSync(gmailConfig.serviceAccountJson, 'utf-8'))
      this.auth = new google.auth.JWT({
        email: key.client_email,
        key: key.private_key,
        scopes: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.modify'],
      })
      this.enabled = true
    } else if (gmailConfig?.clientId && gmailConfig?.clientSecret && gmailConfig?.refreshToken) {
      this.auth = new google.auth.OAuth2(gmailConfig.clientId, gmailConfig.clientSecret)
      this.auth.setCredentials({ refresh_token: gmailConfig.refreshToken })
      this.enabled = true
    }
  }

  isEnabled() {
    return this.enabled
  }

  private async ensureClient() {
    if (!this.gmail && this.auth) {
      this.gmail = google.gmail({ version: 'v1', auth: this.auth })
    }
    return this.gmail
  }

  async listMessages(query: string, maxResults = 50): Promise<EmailMessage[]> {
    const client = await this.ensureClient()
    if (!client) return []

    try {
      const res = await client.users.messages.list({ userId: 'me', q: query, maxResults })
      const messages = res.data.messages || []
      const results: EmailMessage[] = []

      for (const m of messages) {
        if (!m.id) continue
        const detail = await client.users.messages.get({ userId: 'me', id: m.id, format: 'full' })
        const msg = detail.data
        const headers = msg.payload?.headers || []
        const getHeader = (name: string) => headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || ''

        let body = ''
        const parts = msg.payload?.parts || [msg.payload]
        for (const part of parts) {
          if (part?.body?.data && part.mimeType === 'text/plain') {
            body = Buffer.from(part.body.data, 'base64').toString('utf-8')
            break
          }
        }

        results.push({
          id: msg.id || m.id,
          threadId: msg.threadId || '',
          from: getHeader('from'),
          to: getHeader('to'),
          subject: getHeader('subject'),
          date: getHeader('date'),
          body,
          labels: msg.labelIds || [],
        })
      }

      return results
    } catch (err: any) {
      console.error('Gmail listMessages error:', err.message)
      return []
    }
  }

  async listUnread(labelId?: string): Promise<EmailMessage[]> {
    let query = 'is:unread'
    if (labelId) query += ` label:${labelId}`
    return this.listMessages(query)
  }
}
