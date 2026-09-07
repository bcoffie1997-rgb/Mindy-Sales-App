export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function apiJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', ...init })
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    if (response.status === 401) window.location.reload()
    throw new ApiError(payload?.error || `Request failed (${response.status})`, response.status)
  }

  return payload as T
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong'
}
