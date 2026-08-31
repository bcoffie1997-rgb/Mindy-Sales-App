import fs from 'fs'
import path from 'path'

export function loadConfig(dataDir: string) {
  const configPath = path.join(dataDir, 'config.json')
  let config: any = {}
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  } catch {
    config = {}
  }

  // Override secrets from environment
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY
  if (stripeSecretKey) {
    config.stripe = { ...(config.stripe || {}), api_key: stripeSecretKey, enabled: true }
  }
  if (process.env.SLACK_BOT_TOKEN) {
    config.slack = {
      ...(config.slack || {}),
      bot_token: process.env.SLACK_BOT_TOKEN,
    }
  }

  // Integration credentials
  config.integrations = {
    gmail: {
      clientId: process.env.GMAIL_CLIENT_ID || '',
      clientSecret: process.env.GMAIL_CLIENT_SECRET || '',
      refreshToken: process.env.GMAIL_REFRESH_TOKEN || '',
      serviceAccountJson: process.env.GMAIL_SERVICE_ACCOUNT_JSON || '',
    },
    calendar: {
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
    },
    fireflies: {
      apiKey: process.env.FIREFLIES_API_KEY || '',
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
    },
  }

  return config
}

export type Config = ReturnType<typeof loadConfig>
