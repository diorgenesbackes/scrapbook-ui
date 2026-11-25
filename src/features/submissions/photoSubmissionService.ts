import { environment } from '../../config/environment'
import { getJson, postJson } from '../../lib/httpClient'
import {
  isSubmissionInstant, issue, submissionBase, submissionObject,
  type SubmissionAttempt, type SubmissionCredential, type SubmissionIdentificationData,
} from './submissionService'

export const photoSubmissionDisabledCode = 'PHOTO_SUBMISSION_DISABLED'
export const photoSubmissionUnavailableMessage = 'O envio de fotos está indisponível.'
export type PhotoCategory = 'testimonial' | 'moment'

export type PhotoManifest = {
  fileKey: string
  position: number
  declaredMediaType: string
  sizeBytes: number
  sha256: string
}

export type PhotoSubmission = {
  category: PhotoCategory
  format: 'photo'
  caption?: string
  files: readonly PhotoManifest[]
  identification: SubmissionIdentificationData
}

type Failure =
  | { kind: 'unknown'; retryAfterMs: number }
  | { kind: 'missing' | 'cancelled' }
  | { kind: 'error'; code: string; message: string; problemPositions?: number[]; problemMessage?: string }

export type PhotoStatus =
  | Failure
  | { kind: 'receiving'; completionDeadlineAt: string | null; pendingPositions: number[] }
  | { kind: 'validating' }
  | { kind: 'expired'; problemPositions?: number[] }
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

function failure(response: Response, category: PhotoCategory): Failure {
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
        return { ...problem, message: category === 'moment'
          ? 'Confira a identificação, as fotos e a legenda antes de enviar.'
          : 'Confira a identificação, a foto e a legenda antes de enviar.' }
      }
      return problem
    }
  }
  return { kind: 'unknown', retryAfterMs: 0 }
}

function positions(value: unknown, maximum: number): number[] | null {
  if (!Array.isArray(value) || value.length > maximum) return null
  const result = new Set<number>()
  for (const position of value) {
    if (typeof position !== 'number' || !Number.isInteger(position)
      || position < 1 || position > maximum || result.has(position)) return null
    result.add(position)
  }
  return [...result].sort((left, right) => left - right)
}

function status(response: Response, draft: PhotoSubmission): PhotoStatus {
  if (response.kind !== 'ok') return failure(response, draft.category)
  const result = submissionObject(response.payload)
  const moment = draft.category === 'moment'
  switch (result?.state) {
    case 'authorized':
    case 'receiving': {
      const completionDeadlineAt = isSubmissionInstant(result.completionDeadlineAt) ? result.completionDeadlineAt : null
      const pendingPositions = moment ? positions(result.pendingPositions, draft.files.length) : [1]
      if (pendingPositions && (!moment || completionDeadlineAt)) return { kind: 'receiving', completionDeadlineAt, pendingPositions }
      break
    }
    case 'validating':
      return { kind: result.state }
    case 'expired': {
      if (!moment) return { kind: 'expired' }
      const problemPositions = positions(result.problemPositions, draft.files.length)
      if (problemPositions) return { kind: 'expired', problemPositions }
      break
    }
    case 'confirmed':
      if (isSubmissionInstant(result.confirmedAt)) return { kind: 'confirmed', confirmedAt: result.confirmedAt }
      break
    case 'rejected': {
      if (!moment) return { kind: 'error', code: 'PHOTO_REJECTED', message: 'A foto foi rejeitada. Confira o arquivo e escolha outra foto.' }
      const problemPositions = positions(result.problemPositions, draft.files.length)
      if (problemPositions) return {
        kind: 'error', code: 'PHOTO_REJECTED', message: 'O conjunto não foi enviado. Confira os arquivos indicados.',
        problemPositions, problemMessage: result.code === 'photo-resource-budget'
          ? 'A foto excedeu os limites de processamento. Escolha outro arquivo.'
          : 'A foto não passou na validação. Confira o arquivo ou escolha outra foto.',
      }
      break
    }
  }
  return failure(response, draft.category)
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
  return status(await postJson(submissionBase(code) + '/submissions', attempt.draft, attempt.key, signal, attempt.authorization), attempt.draft)
}

export async function readPhotoSubmission(code: string, attempt: SubmissionAttempt<PhotoSubmission>, signal: AbortSignal): Promise<PhotoStatus> {
  return status(await getJson(attemptPath(code, attempt), signal, 'omit', attempt.authorization), attempt.draft)
}

export async function authorizePhotoUpload(
  code: string, attempt: SubmissionAttempt<PhotoSubmission>, file: PhotoManifest, signal: AbortSignal,
): Promise<PhotoUploadAuthorization | Failure> {
  const path = attemptPath(code, attempt) + '/files/' + file.fileKey + '/upload-authorizations'
  const response = await postJson(path, {}, undefined, signal, attempt.authorization)
  if (response.kind !== 'ok') return failure(response, attempt.draft.category)
  const grant = submissionObject(response.payload)
  if (grant?.method !== 'PUT' || !isSubmissionInstant(grant.expiresAt)) return failure(response, attempt.draft.category)
  const url = uploadUrl(grant.url)
  const headers = Object.entries(submissionObject(grant.headers) ?? {})
  const mediaType = headers.find(([name]) => name.toLowerCase() === 'content-type')?.[1]
  const checksum = headers.find(([name]) => name.toLowerCase() === 'x-amz-checksum-sha256')?.[1]
  return url && headers.length === 2 && mediaType === file.declaredMediaType && checksum === file.sha256
    ? { kind: 'authorized', url, mediaType, checksum, expiresAt: grant.expiresAt }
    : failure(response, attempt.draft.category)
}

export async function completePhotoSubmission(code: string, attempt: SubmissionAttempt<PhotoSubmission>, signal: AbortSignal): Promise<PhotoStatus> {
  return status(await postJson(attemptPath(code, attempt) + '/completion', {}, undefined, signal, attempt.authorization), attempt.draft)
}
