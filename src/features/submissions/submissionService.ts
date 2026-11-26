import type { GuestAccessNotice, GuestIdentification } from '../guest-identification/GuestIdentificationForm'
import { getJson, postJson } from '../../lib/httpClient'

export type SubmissionIdentificationData = { guestName: string; noticeCode: string; consentProof: string }

export type TextSubmission = {
  category: 'testimonial'
  format: 'text'
  text: string
  identification: SubmissionIdentificationData
}

export type SubmissionCredential = { key: string; authorization: string }
export type SubmissionAttempt<Draft = TextSubmission> = SubmissionCredential & { draft: Draft }

export type AttemptResult =
  | { kind: 'confirmed'; confirmedAt: string }
  | { kind: 'missing' | 'unknown' | 'cancelled' }
  | { kind: 'error'; code: string; message: string }

const instant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,7})?(Z|\+00:00)$/
export const submissionBase = (code: string) => '/api/v1/public-events/' + encodeURIComponent(code)
export const submissionAttemptPath = (code: string, attempt: SubmissionCredential) => submissionBase(code) + '/submissions/' + attempt.key

export function submissionObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

export function isSubmissionInstant(value: unknown): value is string {
  return typeof value === 'string' && instant.test(value) && Number.isFinite(Date.parse(value))
}

export function issue(payload: unknown): AttemptResult & { kind: 'error' } {
  const problem = submissionObject(payload)
  const code = typeof problem?.code === 'string' ? problem.code : ''
  switch (code) {
    case 'SUBMISSION_CONSENT_REQUIRED': return { kind: 'error', code, message: 'Confirme o aviso para continuar.' }
    case 'UPLOAD_COMPLETION_DEADLINE_EXCEEDED': return { kind: 'error', code, message: 'O prazo para concluir este envio terminou.' }
    case 'UPLOAD_WINDOW_CLOSED': return { kind: 'error', code, message: problem?.windowState === 'before'
      ? 'Novos envios ainda não estão disponíveis.' : 'O prazo para novos envios terminou.' }
    case 'IDEMPOTENCY_KEY_REUSED': return { kind: 'error', code, message: 'Este envio já está associado a outro conteúdo.' }
    case 'REQUEST_VALIDATION_FAILED': return { kind: 'error', code, message: 'Confira a identificação e o texto antes de enviar.' }
    default: return { kind: 'error', code, message: 'Não foi possível continuar o envio. Tente novamente.' }
  }
}

export async function readSubmissionNotice(code: string, signal: AbortSignal): Promise<GuestAccessNotice | null> {
  const response = await getJson(submissionBase(code) + '/contribution-notice', signal, 'omit')
  const notice = response.kind === 'ok' ? submissionObject(response.payload) : null
  return typeof notice?.code === 'string' && !!notice.code && typeof notice.body === 'string' && !!notice.body
    ? { code: notice.code, body: notice.body } : null
}

export async function confirmSubmissionConsent(identification: GuestIdentification, signal: AbortSignal) {
  const response = await postJson(submissionBase(identification.eventCode) + '/submission-consents', {
    guestName: identification.guestName,
    noticeCode: identification.noticeCode,
    accepted: true,
  }, undefined, signal)
  const value = response.kind === 'ok' ? submissionObject(response.payload) : null
  if (typeof value?.consentProof === 'string' && value.consentProof && isSubmissionInstant(value.expiresAt)) {
    return { kind: 'ready' as const, proof: value.consentProof }
  }
  return issue(response.kind === 'http' ? response.payload : null)
}

export function newSubmissionAttempt<Draft>(draft: Draft): SubmissionAttempt<Draft> {
  const secret = crypto.getRandomValues(new Uint8Array(32))
  const authorization = 'Bearer ' + Array.from(secret, byte => byte.toString(16).padStart(2, '0')).join('')
  return { key: crypto.randomUUID(), authorization, draft }
}

function attemptResult(response: Awaited<ReturnType<typeof getJson>>): AttemptResult {
  if (response.kind === 'cancelled') return { kind: 'cancelled' }
  if (response.kind === 'ok') {
    const value = submissionObject(response.payload)
    if (value?.state === 'confirmed' && isSubmissionInstant(value.confirmedAt)) {
      return { kind: 'confirmed', confirmedAt: value.confirmedAt }
    }
  }
  if (response.kind === 'http') {
    if (response.status === 404) return { kind: 'missing' }
    if (response.status < 500 && ![408, 429].includes(response.status) && response.payload) return issue(response.payload)
  }
  return { kind: 'unknown' }
}

export async function submitText(code: string, attempt: SubmissionAttempt, signal: AbortSignal) {
  return attemptResult(await postJson(submissionBase(code) + '/submissions', attempt.draft,
    attempt.key, signal, attempt.authorization))
}

export async function readSubmission(code: string, attempt: SubmissionAttempt, signal: AbortSignal) {
  return attemptResult(await getJson(submissionAttemptPath(code, attempt), signal, 'omit', attempt.authorization))
}
