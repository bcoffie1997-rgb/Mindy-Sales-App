import type { Config } from '../config.js'

export interface SlackMessage {
  channel: string
  text: string
  blocks?: any[]
}

export class SlackClient {
  private token: string
  private enabled: boolean

  constructor(config: Config) {
    this.token = config?.slack?.bot_token || ''
    this.enabled = !!this.token
  }

  isEnabled() {
    return this.enabled
  }

  async postMessage(message: SlackMessage): Promise<{ ok: boolean; error?: string }> {
    if (!this.enabled) {
      return { ok: false, error: 'Slack bot token not configured' }
    }

    try {
      const res = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: message.channel,
          text: message.text,
          ...(message.blocks ? { blocks: message.blocks } : {}),
        }),
      })
      const data = await res.json()
      return { ok: !!data.ok, error: data.error }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  }

  async postToChannel(channelName: keyof Config['slack']['channels'], text: string): Promise<{ ok: boolean; error?: string }> {
    const channels = (this as any).config?.slack?.channels || {}
    const channel = channels[channelName]?.id || channelName
    return this.postMessage({ channel, text })
  }
}
