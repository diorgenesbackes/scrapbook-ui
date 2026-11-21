import { environment } from '../config/environment'

type JsonResult =
  | { kind: 'ok'; payload: unknown }
  | { kind: 'http'; status: number; payload: unknown }
  | { kind: 'cancelled' | 'network' | 'invalid-json' | 'empty' }

export function getJson(path: string, signal: AbortSignal): Promise<JsonResult> {
  return requestJson(path, {}, signal)
}

export function postJson(path: string, body: unknown, key: string, signal: AbortSignal): Promise<JsonResult> {
  return requestJson(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(body),
  }, signal)
}

async function requestJson(path: string, options: {
  method?: string
  headers?: Record<string, string>
  body?: string
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

  try {
    const payload: unknown = await response.json()
    return response.ok ? { kind: 'ok', payload } : { kind: 'http', status: response.status, payload }
  } catch {
    if (signal.aborted) return { kind: 'cancelled' }
    return response.ok ? { kind: 'invalid-json' } : { kind: 'http', status: response.status, payload: null }
  }
}
