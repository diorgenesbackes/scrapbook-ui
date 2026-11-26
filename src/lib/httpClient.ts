import { environment } from '../config/environment'

type JsonResult =
  | { kind: 'ok'; payload: unknown }
  | { kind: 'http'; status: number; payload: unknown; retryAfter: string | null }
  | { kind: 'cancelled' | 'network' | 'invalid-json' | 'empty' }

export function getJson(path: string, signal: AbortSignal, credentials?: RequestCredentials, authorization?: string): Promise<JsonResult> {
  return requestJson(path, { ...credentials && { credentials }, ...authorization && { headers: { Authorization: authorization } } }, signal)
}

export function postJson(path: string, body: unknown, key: string | undefined, signal: AbortSignal, authorization?: string): Promise<JsonResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (key !== undefined) headers['Idempotency-Key'] = key
  if (authorization) headers.Authorization = authorization
  return requestJson(path, {
    method: 'POST',
    headers,
    ...authorization && { credentials: 'omit' },
    body: JSON.stringify(body),
  }, signal)
}

export function putJson(path: string, body: unknown, signal: AbortSignal): Promise<JsonResult> {
  return requestJson(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, signal)
}

async function requestJson(path: string, options: {
  method?: string
  headers?: Record<string, string>
  body?: string
  credentials?: RequestCredentials
}, signal: AbortSignal): Promise<JsonResult> {
  let response: Response
  try {
    response = await fetch(environment.apiBaseUrl + path, {
      ...options,
      headers: { Accept: 'application/json', ...options.headers },
      cache: 'no-store',
      signal,
    })
  } catch {
    return { kind: signal.aborted ? 'cancelled' : 'network' }
  }

  if (response.status === 204) return { kind: 'empty' }
  const retryAfter = [429, 503].includes(response.status) ? response.headers.get('Retry-After') : null

  try {
    const payload: unknown = await response.json()
    return response.ok ? { kind: 'ok', payload } : { kind: 'http', status: response.status, payload, retryAfter }
  } catch {
    if (signal.aborted) return { kind: 'cancelled' }
    return response.ok ? { kind: 'invalid-json' } : { kind: 'http', status: response.status, payload: null, retryAfter }
  }
}
