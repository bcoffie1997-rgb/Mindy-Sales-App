import { google, calendar_v3 } from 'googleapis'
import fs from 'fs'
import type { Config } from '../config.js'

export interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  location: string
  attendees: { email: string; name: string; response: string }[]
  description: string
}

export class GoogleCalendarClient {
  private auth: any
  private calendar: calendar_v3.Calendar | null = null
  private enabled = false
  private calendarId: string

  constructor(config: Config) {
    const gmailConfig = config?.integrations?.gmail
    this.calendarId = config?.integrations?.calendar?.calendarId || 'primary'

    if (gmailConfig?.serviceAccountJson && fs.existsSync(gmailConfig.serviceAccountJson)) {
      const key = JSON.parse(fs.readFileSync(gmailConfig.serviceAccountJson, 'utf-8'))
      this.auth = new google.auth.JWT({
        email: key.client_email,
        key: key.private_key,
        scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
        subject: config?.company?.email,
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
    if (!this.calendar && this.auth) {
      this.calendar = google.calendar({ version: 'v3', auth: this.auth })
    }
    return this.calendar
  }

  async listEvents(timeMin?: string, timeMax?: string, maxResults = 100): Promise<CalendarEvent[]> {
    const client = await this.ensureClient()
    if (!client) return []

    try {
      const res = await client.events.list({
        calendarId: this.calendarId,
        timeMin: timeMin || new Date().toISOString(),
        timeMax,
        maxResults,
        singleEvents: true,
        orderBy: 'startTime',
      })

      const events = res.data.items || []
      return events.map((e: any) => ({
        id: e.id || '',
        title: e.summary || 'Meeting',
        start: e.start?.dateTime || e.start?.date || '',
        end: e.end?.dateTime || e.end?.date || '',
        location: e.location || e.hangoutLink || '',
        description: e.description || '',
        attendees: (e.attendees || []).map((a: any) => ({
          email: a.email || '',
          name: a.displayName || a.email?.split('@')[0] || '',
          response: a.responseStatus || 'needsAction',
        })),
      }))
    } catch (err: any) {
      console.error('Google Calendar error:', err.message)
      return []
    }
  }
}
