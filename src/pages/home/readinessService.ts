import { getJson } from '../../lib/httpClient'

export async function checkReadiness(signal: AbortSignal): Promise<boolean> {
  const result = await getJson('/health/ready', signal)
  if (result.kind !== 'ok') return false
  const { payload } = result
  return typeof payload === 'object' && payload !== null && 'status' in payload
    && payload.status === 'up'
}
