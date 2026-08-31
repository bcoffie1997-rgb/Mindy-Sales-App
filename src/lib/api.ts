const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
}

async function errorMessage(response: Response): Promise<string> {
  const fallback = `Request failed (${response.status}${response.statusText ? ` ${response.statusText}` : ''})`
  const contentType = response.headers.get('content-type') || ''

  try {
    if (contentType.includes('application/json')) {
      const body = await response.json()
      if (typeof body === 'string' && body.trim()) return body
      if (body && typeof body === 'object') {
        const message = body.message || body.error || body.detail
        if (typeof message === 'string' && message.trim()) return message
      }
    } else {
      const text = await response.text()
      if (text.trim()) return text.trim()
    }
  } catch {
    // Fall back to the HTTP status when the error body cannot be parsed.
  }

  return fallback
}

export async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), { credentials: 'include', ...init })
  if (!response.ok) throw new Error(await errorMessage(response))

  if (response.status === 204) return undefined as T

  const text = await response.text()
  if (!text) return undefined as T

  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error('The server returned an invalid JSON response.')
  }
}

export function getErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  return error instanceof Error && error.message ? error.message : fallback
}
