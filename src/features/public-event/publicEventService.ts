import { getJson } from '../../lib/httpClient'

export type SubmissionState = 'before' | 'open' | 'closed'

export type PublicEvent = {
  name: string
  startsAt: string
  welcomeMessage: string
  serverTime: number
  submissionWindow: {
    state: SubmissionState
    opensAt: string
    closesAt: string
    completionDeadlineAt: string
    nextTransitionAt: number | null
  }
}

export type PublicEventResult =
  | { kind: 'ready'; event: PublicEvent }
  | { kind: 'unavailable' }
  | { kind: 'failed'; retryAfterMs: number; correlationId: string | null }
  | { kind: 'cancelled' }

const civilPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/
const instantPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,7})?(Z|\+00:00)$/
const correlationPattern = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function isCivil(value: unknown): value is string {
  return typeof value === 'string' && civilPattern.test(value) && Number.isFinite(Date.parse(value + 'Z'))
}

function instant(value: unknown): number | null {
  if (typeof value !== 'string' || !instantPattern.test(value)) return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : null
}

function parsePublicEvent(payload: unknown): PublicEvent | null {
  const event = object(payload)
  if (!event || typeof event.name !== 'string' || typeof event.welcomeMessage !== 'string'
      || !isCivil(event.startsAt) || event.timeZone !== 'America/Sao_Paulo'
      || typeof object(event.cover)?.kind !== 'string') return null

  const serverTime = instant(event.serverTime)
  const window = object(event.submissionWindow)
  if (serverTime === null || !window) return null
  const { state, opensAt, closesAt, completionDeadlineAt } = window
  if ((state !== 'before' && state !== 'open' && state !== 'closed') || !isCivil(opensAt)
      || !isCivil(closesAt) || !isCivil(completionDeadlineAt) || opensAt >= closesAt || closesAt >= completionDeadlineAt) return null

  const nextTransitionAt = instant(window.nextTransitionAt)
  if (state === 'closed' ? window.nextTransitionAt !== null : nextTransitionAt === null || nextTransitionAt < serverTime) return null

  return { name: event.name, startsAt: event.startsAt, welcomeMessage: event.welcomeMessage, serverTime,
    submissionWindow: { state, opensAt, closesAt, completionDeadlineAt, nextTransitionAt } }
}

function retryDelay(value: string | null): number {
  if (!value) return 0
  const delay = /^\d+$/.test(value) ? Number(value) * 1_000 : Date.parse(value) - Date.now()
  return Number.isFinite(delay) ? Math.max(0, delay) : 0
}

export async function getPublicEvent(code: string, signal: AbortSignal): Promise<PublicEventResult> {
  const response = await getJson('/api/v1/public-events/' + encodeURIComponent(code), signal, 'omit')
  if (response.kind === 'cancelled') return { kind: 'cancelled' }
  if (response.kind === 'http' && response.status === 404) return { kind: 'unavailable' }
  if (response.kind === 'ok') {
    const event = parsePublicEvent(response.payload)
    if (event) return { kind: 'ready', event }
  }

  const problem = response.kind === 'http' ? object(response.payload) : null
  const id = problem?.correlationId
  return { kind: 'failed', retryAfterMs: response.kind === 'http' ? retryDelay(response.retryAfter) : 0,
    correlationId: typeof id === 'string' && correlationPattern.test(id) ? id : null }
}
