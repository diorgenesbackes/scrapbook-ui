import { environment } from '../config/environment'

type JsonResult =
  | { kind: 'ok'; payload: unknown }
  | { kind: 'http'; status: number }
  | { kind: 'cancelled' | 'network' | 'invalid-json' | 'empty' }

export async function getJson(path: string, signal: AbortSignal): Promise<JsonResult> {
  let response: Response
  try {
    response = await fetch(environment.apiBaseUrl + path, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal,
    })
  } catch {
    return { kind: signal.aborted ? 'cancelled' : 'network' }
  }

  if (!response.ok) return { kind: 'http', status: response.status }
  if (response.status === 204) return { kind: 'empty' }

  try {
    const payload: unknown = await response.json()
    return { kind: 'ok', payload }
  } catch {
    return { kind: signal.aborted ? 'cancelled' : 'invalid-json' }
  }
}
