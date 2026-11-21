import { getJson, postJson } from '../../lib/httpClient'

const eventsPath = '/api/v1/events'

export type EventSummary = { id: string; name: string; startsAt: string }
export type EventDetail = EventSummary & {
  welcomeMessage: string
  submissionOpensAt: string
  submissionClosesAt: string
  completionDeadlineAt: string
  opensOn: string | null
}
export type EventDraft = { name: string; startsAt: string; openingPolicy: { mode: 'scheduled'; opensOn: string | null } }
type Result<T> =
  | { kind: 'ready'; data: T }
  | { kind: 'expired' | 'not-found' | 'conflict' | 'failed' | 'uncertain' }
  | { kind: 'invalid'; fields: string[] }

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function summary(payload: unknown): EventSummary | null {
  const value = object(payload)
  if (!value || typeof value.id !== 'string' || !/^[1-9][0-9]*$/.test(value.id)
      || typeof value.name !== 'string' || typeof value.startsAt !== 'string' || object(value.cover)?.kind !== 'default') return null
  return { id: value.id, name: value.name, startsAt: value.startsAt }
}

function detail(payload: unknown): EventDetail | null {
  const value = object(payload)
  const event = summary(value)
  if (!value || !event) return null
  const { welcomeMessage, submissionOpensAt, submissionClosesAt, completionDeadlineAt } = value
  const opensOn = object(value.openingPolicy)?.opensOn
  if (typeof welcomeMessage !== 'string' || typeof submissionOpensAt !== 'string'
      || typeof submissionClosesAt !== 'string' || typeof completionDeadlineAt !== 'string'
      || (opensOn !== null && typeof opensOn !== 'string')) return null
  return { ...event, welcomeMessage, submissionOpensAt, submissionClosesAt, completionDeadlineAt, opensOn }
}

export async function listEvents(cursor: string | null, signal: AbortSignal): Promise<Result<{ items: EventSummary[]; nextCursor: string | null }>> {
  const query = cursor === null ? '' : '?' + new URLSearchParams({ cursor })
  const result = await getJson(eventsPath + query, signal)
  if (result.kind === 'http' && result.status === 401) return { kind: 'expired' }
  if (result.kind !== 'ok') return { kind: 'failed' }
  const page = object(result.payload)
  if (!page || !Array.isArray(page.items) || (page.nextCursor !== null && typeof page.nextCursor !== 'string')) return { kind: 'failed' }
  const items = page.items.map(summary)
  if (items.some(item => item === null)) return { kind: 'failed' }
  return { kind: 'ready', data: { items: items.filter(item => item !== null), nextCursor: page.nextCursor } }
}

export async function getEvent(id: string, signal: AbortSignal): Promise<Result<EventDetail>> {
  const result = await getJson(eventsPath + '/' + encodeURIComponent(id), signal)
  if (result.kind === 'http' && result.status === 401) return { kind: 'expired' }
  if (result.kind === 'http' && result.status === 404) return { kind: 'not-found' }
  const data = result.kind === 'ok' ? detail(result.payload) : null
  return data ? { kind: 'ready', data } : { kind: 'failed' }
}

export async function createEvent(draft: EventDraft, key: string, signal: AbortSignal): Promise<Result<EventDetail>> {
  const result = await postJson(eventsPath, draft, key, signal)
  if (result.kind === 'http') {
    if (result.status === 400) return { kind: 'invalid', fields: Object.keys(object(object(result.payload)?.errors) ?? {}) }
    if (result.status === 401) return { kind: 'expired' }
    if (result.status === 409) return { kind: 'conflict' }
    if (result.status < 500) return { kind: 'failed' }
  }
  const data = result.kind === 'ok' ? detail(result.payload) : null
  return data ? { kind: 'ready', data } : { kind: 'uncertain' }
}
