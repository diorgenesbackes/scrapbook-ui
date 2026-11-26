import { getJson, postJson } from '../../lib/httpClient'
import {
  isSubmissionInstant, issue, submissionAttemptPath, submissionBase, submissionObject,
  type SubmissionAttempt, type SubmissionIdentificationData,
} from './submissionService'
import { readUploadAuthorization } from './submissionUpload'
import { videoMultipartThresholdBytes, videoPartCount, videoPartSizeBytes } from './videoParts'

export const videoSubmissionUnavailableMessage = 'O envio de vídeos está indisponível.'
export const videoSubmissionDisabledCode = 'VIDEO_SUBMISSION_DISABLED'
export const videoRejectedCode = 'VIDEO_REJECTED'

export type VideoManifest = {
  fileKey: string
  position: 1
  declaredMediaType: string
  sizeBytes: number
  sha256: string
  partSha256?: readonly string[]
}

export type VideoSubmission = {
  category: 'testimonial' | 'moment'
  format: 'video'
  caption?: string
  files: readonly [VideoManifest]
  identification: SubmissionIdentificationData
}

export type VideoFailure =
  | { kind: 'unknown'; retryAfterMs: number }
  | { kind: 'missing' | 'cancelled' }
  | { kind: 'error'; code: string; message: string }

export type VideoStatus = VideoFailure
  | { kind: 'receiving' | 'validating' | 'reconciling' | 'expired' }
  | { kind: 'confirmed'; confirmedAt: string }

export type VideoUploadStatus = {
  kind: 'ready'
  mode: 'put' | 'multipart'
  uploadedParts: ReadonlySet<number>
  completionDeadlineAt: string
}

type Response = Awaited<ReturnType<typeof getJson>>
type VideoAttempt = SubmissionAttempt<VideoSubmission>

function failure(response: Response): VideoFailure {
  if (response.kind === 'cancelled') return { kind: 'cancelled' }
  if (response.kind === 'http') {
    if (response.status === 404) return { kind: 'missing' }
    if (response.status === 503 && submissionObject(response.payload)?.code === videoSubmissionDisabledCode) {
      return { kind: 'error', code: videoSubmissionDisabledCode, message: videoSubmissionUnavailableMessage }
    }
    const delay = response.retryAfter
    if (delay) {
      const interval = /^\d+$/.test(delay) ? Number(delay) * 1_000 : Date.parse(delay) - Date.now()
      if (Number.isFinite(interval) && interval > 0) return { kind: 'unknown', retryAfterMs: interval }
    }
    if (response.status < 500 && ![408, 429].includes(response.status) && response.payload) {
      const problem = issue(response.payload)
      return problem.code === 'REQUEST_VALIDATION_FAILED'
        ? { ...problem, message: 'Confira a identificação, o vídeo e a legenda antes de enviar.' }
        : problem
    }
  }
  return { kind: 'unknown', retryAfterMs: 0 }
}

function status(response: Response): VideoStatus {
  if (response.kind !== 'ok') return failure(response)
  const result = submissionObject(response.payload)
  switch (result?.state) {
    case 'authorized':
    case 'receiving':
      return { kind: 'receiving' }
    case 'validating':
    case 'reconciling':
    case 'expired':
      return { kind: result.state }
    case 'rejected':
      return { kind: 'error', code: videoRejectedCode, message: 'O vídeo não passou na validação. Confira o arquivo ou escolha outro vídeo.' }
    case 'confirmed':
      if (isSubmissionInstant(result.confirmedAt)) return { kind: 'confirmed', confirmedAt: result.confirmedAt }
      break
  }
  return failure(response)
}

function filePath(code: string, attempt: VideoAttempt) {
  return submissionAttemptPath(code, attempt) + '/files/' + attempt.draft.files[0].fileKey
}

export async function submitVideo(code: string, attempt: VideoAttempt, signal: AbortSignal): Promise<VideoStatus> {
  return status(await postJson(submissionBase(code) + '/submissions', attempt.draft, attempt.key, signal, attempt.authorization))
}

export async function readVideoSubmission(code: string, attempt: VideoAttempt, signal: AbortSignal): Promise<VideoStatus> {
  return status(await getJson(submissionAttemptPath(code, attempt), signal, 'omit', attempt.authorization))
}

export async function readVideoUpload(code: string, attempt: VideoAttempt, signal: AbortSignal): Promise<VideoUploadStatus | VideoFailure> {
  const response = await getJson(filePath(code, attempt) + '/upload-status', signal, 'omit', attempt.authorization)
  if (response.kind !== 'ok') return failure(response)
  const value = submissionObject(response.payload)
  const bytes = attempt.draft.files[0].sizeBytes
  const mode = bytes >= videoMultipartThresholdBytes ? 'multipart' : 'put'
  const partSize = mode === 'multipart' ? videoPartSizeBytes : null
  if (value?.mode !== mode || (value.partSizeBytes ?? null) !== partSize || !isSubmissionInstant(value.completionDeadlineAt)
    || !Array.isArray(value.uploadedParts)) return failure(response)

  const count = videoPartCount(bytes)
  const uploadedParts = new Set<number>()
  for (const number of value.uploadedParts) {
    if (typeof number !== 'number' || !Number.isInteger(number) || number < 1 || number > count || uploadedParts.has(number)) {
      return failure(response)
    }
    uploadedParts.add(number)
  }
  return { kind: 'ready', mode, uploadedParts, completionDeadlineAt: value.completionDeadlineAt }
}

export async function authorizeVideoUpload(code: string, attempt: VideoAttempt, partNumber: number | null, signal: AbortSignal) {
  const file = attempt.draft.files[0]
  const checksum = partNumber === null ? file.sha256 : file.partSha256?.[partNumber - 1]
  if (checksum === undefined) return { kind: 'unknown' as const, retryAfterMs: 0 }
  const response = await postJson(filePath(code, attempt) + '/upload-authorizations', partNumber === null ? {} : { partNumber },
    undefined, signal, attempt.authorization)
  if (response.kind !== 'ok') return failure(response)
  const mediaType = partNumber === null ? file.declaredMediaType : null
  return readUploadAuthorization(response.payload, mediaType, checksum) ?? failure(response)
}

export async function completeVideoSubmission(code: string, attempt: VideoAttempt, signal: AbortSignal): Promise<VideoStatus> {
  return status(await postJson(submissionAttemptPath(code, attempt) + '/completion', {}, undefined, signal, attempt.authorization))
}
