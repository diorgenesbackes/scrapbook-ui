import { getJson, postJson } from '../../lib/httpClient'
import { isInvitationToken } from '../../utils/invitationUrl'

export type Invitation = { id: string; token: string; expiresAt: string }

export type InvitationResult = { kind: 'pending'; invitation: Invitation }
  | { kind: 'available' | 'locked' | 'full' | 'session' | 'not-found' | 'unavailable' | 'failed' }

export type AcceptanceProblem = 'session' | 'unconfirmed' | 'unavailable' | 'used' | 'full' | 'locked' | 'linked' | 'failed'
export type InvitationPreview = { kind: 'eligible'; eventName: string; expiresAt: string }
  | { kind: 'accepted'; eventId: string }
  | { kind: 'problem'; reason: AcceptanceProblem }

type HttpResult = Awaited<ReturnType<typeof getJson>>

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

function pending(value: unknown): InvitationResult {
  const entry = object(value)
  if (entry && typeof entry.id === 'string' && /^[1-9][0-9]*$/.test(entry.id)
    && isInvitationToken(entry.token) && isExpiry(entry.expiresAt)) {
    return { kind: 'pending', invitation: { id: entry.id, token: entry.token, expiresAt: entry.expiresAt } }
  }
  return { kind: 'failed' }
}

function isExpiry(value: unknown): value is string {
  return typeof value === 'string' && /(?:Z|\+00:00)$/.test(value) && Number.isFinite(Date.parse(value))
}

function failure(response: HttpResult): InvitationResult {
  if (response.kind !== 'http') return { kind: 'failed' }
  if (response.status === 401) return { kind: 'session' }
  if (response.status === 404) return { kind: 'not-found' }
  if (response.status === 409) {
    const code = object(response.payload)?.code
    if (code === 'INVITATION_EVENT_LOCKED') return { kind: 'locked' }
    if (code === 'INVITATION_EVENT_FULL') return { kind: 'full' }
    if (code === 'INVITATION_UNAVAILABLE' || code === 'IDEMPOTENCY_KEY_REUSED') return { kind: 'unavailable' }
  }
  return { kind: 'failed' }
}

function invitationPath(eventId: string): string {
  return '/api/v1/events/' + encodeURIComponent(eventId) + '/invitations'
}

export async function getCurrentInvitation(eventId: string, signal: AbortSignal): Promise<InvitationResult> {
  const response = await getJson(invitationPath(eventId) + '/current', signal)
  if (response.kind !== 'ok') return failure(response)
  const body = object(response.payload)
  if (body?.state === 'pending') return pending(body.invitation)
  if (body?.invitation === null && (body.state === 'available' || body.state === 'locked' || body.state === 'full')) {
    return { kind: body.state }
  }
  return { kind: 'failed' }
}

export async function createInvitation(eventId: string, key: string, signal: AbortSignal): Promise<InvitationResult> {
  const response = await postJson(invitationPath(eventId), {}, key, signal)
  return response.kind === 'ok' ? pending(response.payload) : failure(response)
}

const acceptanceProblems = new Map<string, AcceptanceProblem>([
  ['INVITATION_ACCOUNT_UNCONFIRMED', 'unconfirmed'],
  ['INVITATION_UNAVAILABLE', 'unavailable'],
  ['INVITATION_ALREADY_USED', 'used'],
  ['INVITATION_EVENT_FULL', 'full'],
  ['INVITATION_EVENT_LOCKED', 'locked'],
  ['INVITATION_ACCOUNT_ALREADY_LINKED', 'linked'],
])

function acceptanceFailure(response: HttpResult): InvitationPreview {
  if (response.kind !== 'http') return { kind: 'problem', reason: 'failed' }
  if (response.status === 401) return { kind: 'problem', reason: 'session' }
  if (response.status === 404) return { kind: 'problem', reason: 'unavailable' }
  const code = object(response.payload)?.code
  const reason = typeof code === 'string' ? acceptanceProblems.get(code) : undefined
  return { kind: 'problem', reason: reason ?? 'failed' }
}

async function submitToken(operation: 'preview' | 'accept', token: string, signal: AbortSignal): Promise<InvitationPreview> {
  const response = await postJson('/api/v1/invitations/' + operation, { token }, undefined, signal)
  if (response.kind !== 'ok') return acceptanceFailure(response)
  const body = object(response.payload)
  if (body?.state === 'accepted' && typeof body.eventId === 'string'
    && body.eventId.length > 0 && body.eventId[0] !== '0' && !/[^0-9]/.test(body.eventId)) {
    return { kind: 'accepted', eventId: body.eventId }
  }
  if (operation === 'preview' && body?.state === 'eligible' && typeof body.eventName === 'string'
    && body.eventName.trim() && isExpiry(body.expiresAt)) {
    return { kind: 'eligible', eventName: body.eventName, expiresAt: body.expiresAt }
  }
  return { kind: 'problem', reason: 'failed' }
}

export function previewInvitation(token: string, signal: AbortSignal): Promise<InvitationPreview> {
  return submitToken('preview', token, signal)
}

export function acceptInvitation(token: string, signal: AbortSignal): Promise<InvitationPreview> {
  return submitToken('accept', token, signal)
}
