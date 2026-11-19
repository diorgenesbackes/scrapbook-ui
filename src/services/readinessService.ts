import { environment } from '../config/environment'

export async function checkReadiness(signal: AbortSignal): Promise<boolean> {
  const response = await fetch(environment.apiBaseUrl + '/health/ready', {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal,
  })
  if (!response.ok) return false
  const payload: unknown = await response.json()
  return typeof payload === 'object' && payload !== null && 'status' in payload
    && payload.status === 'up'
}
