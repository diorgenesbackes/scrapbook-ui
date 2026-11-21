import { getJson, postJson, putJson } from '../../lib/httpClient'

const eventsPath = '/api/v1/events'

export type EventSummary = { id: string; name: string; startsAt: string }
export type OpeningMode = 'immediate' | 'scheduled'
export type OpeningDraft = { mode: OpeningMode; opensOn: string | null }
type OpeningPolicy = OpeningDraft & { state: 'flexible' | 'scheduled_locked' | 'immediate_once'; canEdit: boolean }
export type EventDetail = EventSummary & {
  version: string
  welcomeMessage: string
  usesDefaultWelcomeMessage: boolean
  canEditDetails: boolean
  submissionOpensAt: string
  submissionClosesAt: string
  completionDeadlineAt: string
  openingPolicy: OpeningPolicy
}
export type DetailsDraft = { name: string; startsAt: string; welcomeMessage: string | null }
export type EventDraft = DetailsDraft & { openingPolicy: OpeningDraft }
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
  const policy = object(value.openingPolicy)
  const version = value.version
  if (!policy || typeof version !== 'string' || !/^[0-9]+$/.test(version)) return null
  const { mode, opensOn, state, canEdit } = policy
  if (typeof welcomeMessage !== 'string' || typeof submissionOpensAt !== 'string'
      || typeof submissionClosesAt !== 'string' || typeof completionDeadlineAt !== 'string'
      || (mode !== 'immediate' && mode !== 'scheduled')
      || (mode === 'scheduled' ? typeof opensOn !== 'string' : opensOn !== null)
      || (state !== 'flexible' && state !== 'scheduled_locked' && state !== 'immediate_once')
      || typeof canEdit !== 'boolean' || (opensOn !== null && typeof opensOn !== 'string')) return null
  return { ...event, version, welcomeMessage, submissionOpensAt, submissionClosesAt, completionDeadlineAt,
    usesDefaultWelcomeMessage: value.usesDefaultWelcomeMessage !== false, canEditDetails: value.canEditDetails === true,
    openingPolicy: { mode, opensOn, state, canEdit } }
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

export async function replaceEventOpening(id: string, draft: OpeningDraft, expectedVersion: string,
  signal: AbortSignal): Promise<Result<EventDetail> | { kind: 'locked' }> {
  return replaceEvent(id, 'opening-policy', draft, expectedVersion, 'EVENT_OPENING_LOCKED', signal)
}

export async function replaceEventDetails(id: string, draft: DetailsDraft, expectedVersion: string,
  signal: AbortSignal): Promise<Result<EventDetail> | { kind: 'locked' }> {
  return replaceEvent(id, 'details', draft, expectedVersion, 'EVENT_LOCKED', signal)
}

async function replaceEvent(id: string, section: 'opening-policy' | 'details', draft: OpeningDraft | DetailsDraft,
  expectedVersion: string, lockCode: string, signal: AbortSignal): Promise<Result<EventDetail> | { kind: 'locked' }> {
  const result = await putJson(eventsPath + '/' + encodeURIComponent(id) + '/' + section,
    { ...draft, expectedVersion }, signal)
  if (result.kind === 'http') {
    if (result.status === 401) return { kind: 'expired' }
    if (result.status === 404) return { kind: 'not-found' }
    if (result.status === 409) {
      return object(result.payload)?.code === lockCode ? { kind: 'locked' } : { kind: 'conflict' }
    }
    if (result.status === 400) return { kind: 'invalid', fields: Object.keys(object(object(result.payload)?.errors) ?? {}) }
  }
  const data = result.kind === 'ok' ? detail(result.payload) : null
  return data ? { kind: 'ready', data } : { kind: 'failed' }
}

export type OpeningStatus =
  | { contentState: 'closed'; opensOn: string; opensAt: number; serverTime: number }
  | { contentState: 'open'; serverTime: number }

export type OpeningStatusResult =
  | { kind: 'ready'; data: OpeningStatus }
  | { kind: 'expired' | 'not-found' | 'failed' }

export async function getEventOpeningStatus(id: string, signal: AbortSignal): Promise<OpeningStatusResult> {
  const result = await getJson(eventsPath + '/' + encodeURIComponent(id) + '/opening-status', signal)
  if (result.kind === 'http' && result.status === 401) return { kind: 'expired' }
  if (result.kind === 'http' && result.status === 404) return { kind: 'not-found' }
  const payload = result.kind === 'ok' ? object(result.payload) : null
  if (!payload || typeof payload.serverTime !== 'string') return { kind: 'failed' }
  const serverTime = Date.parse(payload.serverTime)
  if (!Number.isFinite(serverTime)) return { kind: 'failed' }
  if (payload.contentState === 'open') return { kind: 'ready', data: { contentState: 'open', serverTime } }
  if (payload.contentState === 'closed' && typeof payload.opensOn === 'string'
      && /^\d{4}-\d{2}-\d{2}$/.test(payload.opensOn) && typeof payload.opensAt === 'string') {
    const opensAt = Date.parse(payload.opensAt)
    if (Number.isFinite(opensAt) && opensAt >= serverTime) {
      return { kind: 'ready', data: { contentState: 'closed', opensOn: payload.opensOn, opensAt, serverTime } }
    }
  }
  return { kind: 'failed' }
}
