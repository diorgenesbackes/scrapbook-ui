import { getJson, postJson } from '../../lib/httpClient'
import { isInvitationToken } from '../../utils/invitationUrl'

export type Invitation = { id: string; token: string; expiresAt: string }

export type InvitationResult = { kind: 'pending'; invitation: Invitation }
  | { kind: 'available' | 'locked' | 'full' | 'session' | 'not-found' | 'unavailable' | 'failed' }

type HttpResult = Awaited<ReturnType<typeof getJson>>

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

function pending(value: unknown): InvitationResult {
  const entry = object(value)
  if (entry && typeof entry.id === 'string' && /^[1-9][0-9]*$/.test(entry.id)
    && isInvitationToken(entry.token) && typeof entry.expiresAt === 'string'
    && /(?:Z|\+00:00)$/.test(entry.expiresAt) && Number.isFinite(Date.parse(entry.expiresAt))) {
    return { kind: 'pending', invitation: { id: entry.id, token: entry.token, expiresAt: entry.expiresAt } }
  }
  return { kind: 'failed' }
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
