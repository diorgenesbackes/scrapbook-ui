import { environment } from '../../config/environment'
import { getJson, postJson } from '../../lib/httpClient'
import {
  isSubmissionInstant, issue, submissionBase, submissionObject,
  type SubmissionAttempt, type SubmissionCredential, type SubmissionIdentificationData,
} from './submissionService'

export const photoSubmissionDisabledCode = 'PHOTO_SUBMISSION_DISABLED'
export const photoSubmissionUnavailableMessage = 'O envio de fotos está indisponível.'

export type PhotoManifest = {
  fileKey: string
  position: 1
  declaredMediaType: string
  sizeBytes: number
  sha256: string
}

export type PhotoSubmission = {
  category: 'testimonial'
  format: 'photo'
  caption?: string
  files: [PhotoManifest]
  identification: SubmissionIdentificationData
}

type Failure =
  | { kind: 'unknown'; retryAfterMs: number }
  | { kind: 'missing' | 'cancelled' }
  | { kind: 'error'; code: string; message: string }

export type PhotoStatus =
  | Failure
  | { kind: 'receiving'; completionDeadlineAt: string | null }
  | { kind: 'validating' | 'expired' }
  | { kind: 'confirmed'; confirmedAt: string }

export type PhotoUploadAuthorization = {
  kind: 'authorized'
  url: string
  mediaType: string
  checksum: string
  expiresAt: string
}

type Response = Awaited<ReturnType<typeof getJson>>

function attemptPath(code: string, attempt: SubmissionCredential) {
  return submissionBase(code) + '/submissions/' + attempt.key
}

function failure(response: Response): Failure {
  if (response.kind === 'cancelled') return { kind: 'cancelled' }
  if (response.kind === 'http') {
    if (response.status === 404) return { kind: 'missing' }
    if (response.status === 503 && submissionObject(response.payload)?.code === photoSubmissionDisabledCode) {
      return { kind: 'error', code: photoSubmissionDisabledCode, message: photoSubmissionUnavailableMessage }
    }
    const delay = response.retryAfter
    if (delay) {
      const interval = /^\d+$/.test(delay) ? Number(delay) * 1_000 : Date.parse(delay) - Date.now()
      if (Number.isFinite(interval) && interval > 0) return { kind: 'unknown', retryAfterMs: interval }
    }
    if (response.status < 500 && ![408, 429].includes(response.status) && response.payload) {
      const problem = issue(response.payload)
      if (problem.code === 'REQUEST_VALIDATION_FAILED') {
        return { ...problem, message: 'Confira a identificação, a foto e a legenda antes de enviar.' }
      }
      return problem
    }
  }
  return { kind: 'unknown', retryAfterMs: 0 }
}

function status(response: Response): PhotoStatus {
  if (response.kind !== 'ok') return failure(response)
  const result = submissionObject(response.payload)
  switch (result?.state) {
    case 'authorized':
    case 'receiving':
      return { kind: 'receiving', completionDeadlineAt: isSubmissionInstant(result.completionDeadlineAt) ? result.completionDeadlineAt : null }
    case 'validating':
    case 'expired':
      return { kind: result.state }
    case 'confirmed':
      if (isSubmissionInstant(result.confirmedAt)) return { kind: 'confirmed', confirmedAt: result.confirmedAt }
      break
    case 'rejected':
      return { kind: 'error', code: 'PHOTO_REJECTED', message: 'A foto foi rejeitada. Confira o arquivo e escolha outra foto.' }
  }
  return failure(response)
}

function uploadUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !environment.submissionUploadOrigin) return null
  try {
    const url = new URL(value)
    const http = url.protocol === 'https:' || url.protocol === 'http:'
    return http && url.origin === environment.submissionUploadOrigin && !url.username && !url.password && !url.hash
      ? value : null
  } catch {
    return null
  }
}

export async function submitPhoto(code: string, attempt: SubmissionAttempt<PhotoSubmission>, signal: AbortSignal): Promise<PhotoStatus> {
  return status(await postJson(submissionBase(code) + '/submissions', attempt.draft, attempt.key, signal, attempt.authorization))
}

export async function readPhotoSubmission(code: string, attempt: SubmissionCredential, signal: AbortSignal): Promise<PhotoStatus> {
  return status(await getJson(attemptPath(code, attempt), signal, 'omit', attempt.authorization))
}

export async function authorizePhotoUpload(
  code: string, attempt: SubmissionAttempt<PhotoSubmission>, signal: AbortSignal,
): Promise<PhotoUploadAuthorization | Failure> {
  const file = attempt.draft.files[0]
  const path = attemptPath(code, attempt) + '/files/' + file.fileKey + '/upload-authorizations'
  const response = await postJson(path, {}, undefined, signal, attempt.authorization)
  if (response.kind !== 'ok') return failure(response)
  const grant = submissionObject(response.payload)
  if (grant?.method !== 'PUT' || !isSubmissionInstant(grant.expiresAt)) return failure(response)
  const url = uploadUrl(grant.url)
  const headers = Object.entries(submissionObject(grant.headers) ?? {})
  const mediaType = headers.find(([name]) => name.toLowerCase() === 'content-type')?.[1]
  const checksum = headers.find(([name]) => name.toLowerCase() === 'x-amz-checksum-sha256')?.[1]
  return url && headers.length === 2 && mediaType === file.declaredMediaType && checksum === file.sha256
    ? { kind: 'authorized', url, mediaType, checksum, expiresAt: grant.expiresAt }
    : failure(response)
}

export async function completePhotoSubmission(code: string, attempt: SubmissionCredential, signal: AbortSignal): Promise<PhotoStatus> {
  return status(await postJson(attemptPath(code, attempt) + '/completion', {}, undefined, signal, attempt.authorization))
}
