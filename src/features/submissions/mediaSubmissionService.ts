import { getJson, postJson } from '../../lib/httpClient'
import {
  isSubmissionInstant, issue, submissionAttemptPath, submissionBase, submissionObject,
  type SubmissionAttempt, type SubmissionIdentificationData,
} from './submissionService'
import { readUploadAuthorization } from './submissionUpload'
import { videoMultipartThresholdBytes, videoPartCount, videoPartSizeBytes } from './videoParts'

export const maxAudioBytes = 50_000_000

export const mediaSubmissionIssues = {
  audio: {
    disabledCode: 'AUDIO_SUBMISSION_DISABLED',
    unavailableMessage: 'O envio de áudios está indisponível.',
    rejectedCode: 'AUDIO_REJECTED',
    rejectedMessage: 'O áudio não passou na validação. Confira o arquivo ou escolha outro áudio.',
    validationMessage: 'Confira a identificação, o áudio e a legenda antes de enviar.',
  },
  video: {
    disabledCode: 'VIDEO_SUBMISSION_DISABLED',
    unavailableMessage: 'O envio de vídeos está indisponível.',
    rejectedCode: 'VIDEO_REJECTED',
    rejectedMessage: 'O vídeo não passou na validação. Confira o arquivo ou escolha outro vídeo.',
    validationMessage: 'Confira a identificação, o vídeo e a legenda antes de enviar.',
  },
} as const

export type MediaUploadFormat = keyof typeof mediaSubmissionIssues
type SubmissionCategory = { audio: 'testimonial'; video: 'testimonial' | 'moment' }

type MediaManifest = {
  fileKey: string
  position: 1
  declaredMediaType: string
  sizeBytes: number
  sha256: string
  partSha256?: readonly string[]
}

export type MediaSubmission<Format extends MediaUploadFormat = MediaUploadFormat> = {
  category: SubmissionCategory[Format]
  format: Format
  caption?: string
  files: readonly [MediaManifest]
  identification: SubmissionIdentificationData
}

export type MediaFailure =
  | { kind: 'unknown'; retryAfterMs: number }
  | { kind: 'missing' | 'cancelled' }
  | { kind: 'error'; code: string; message: string }

export type MediaStatus = MediaFailure
  | { kind: 'receiving' | 'validating' | 'reconciling' | 'expired' }
  | { kind: 'confirmed'; confirmedAt: string }

export type MediaUploadStatus = {
  kind: 'ready'
  mode: 'put' | 'multipart'
  uploadedParts: ReadonlySet<number>
  completionDeadlineAt: string
}

type Response = Awaited<ReturnType<typeof getJson>>
type MediaAttempt = SubmissionAttempt<MediaSubmission>

function failure(response: Response, format: MediaUploadFormat): MediaFailure {
  const issues = mediaSubmissionIssues[format]
  if (response.kind === 'cancelled') return { kind: 'cancelled' }
  if (response.kind === 'http') {
    if (response.status === 404) return { kind: 'missing' }
    if (response.status === 503 && submissionObject(response.payload)?.code === issues.disabledCode) {
      return { kind: 'error', code: issues.disabledCode, message: issues.unavailableMessage }
    }
    const delay = response.retryAfter
    if (delay) {
      const interval = /^\d+$/.test(delay) ? Number(delay) * 1_000 : Date.parse(delay) - Date.now()
      if (Number.isFinite(interval) && interval > 0) return { kind: 'unknown', retryAfterMs: interval }
    }
    if (response.status < 500 && ![408, 429].includes(response.status) && response.payload) {
      const problem = issue(response.payload)
      return problem.code === 'REQUEST_VALIDATION_FAILED'
        ? { ...problem, message: issues.validationMessage }
        : problem
    }
  }
  return { kind: 'unknown', retryAfterMs: 0 }
}

function status(response: Response, format: MediaUploadFormat): MediaStatus {
  const issues = mediaSubmissionIssues[format]
  if (response.kind !== 'ok') return failure(response, format)
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
      if (format === 'audio' && result.code === 'audio-received-late') return { kind: 'expired' }
      return {
        kind: 'error',
        code: issues.rejectedCode,
        message: format === 'audio' && result.code === 'audio-resource-budget'
          ? 'O áudio excedeu os limites de processamento. Escolha outro áudio.'
          : issues.rejectedMessage,
      }
    case 'confirmed':
      if (isSubmissionInstant(result.confirmedAt)) return { kind: 'confirmed', confirmedAt: result.confirmedAt }
      break
  }
  return failure(response, format)
}

function filePath(code: string, attempt: MediaAttempt) {
  return submissionAttemptPath(code, attempt) + '/files/' + attempt.draft.files[0].fileKey
}

export async function submitMedia(code: string, attempt: MediaAttempt, signal: AbortSignal): Promise<MediaStatus> {
  const response = await postJson(submissionBase(code) + '/submissions', attempt.draft, attempt.key, signal, attempt.authorization)
  return status(response, attempt.draft.format)
}

export async function readMediaSubmission(code: string, attempt: MediaAttempt, signal: AbortSignal): Promise<MediaStatus> {
  const response = await getJson(submissionAttemptPath(code, attempt), signal, 'omit', attempt.authorization)
  return status(response, attempt.draft.format)
}

export async function readMediaUpload(code: string, attempt: MediaAttempt, signal: AbortSignal): Promise<MediaUploadStatus | MediaFailure> {
  const { format } = attempt.draft
  const response = await getJson(filePath(code, attempt) + '/upload-status', signal, 'omit', attempt.authorization)
  if (response.kind !== 'ok') return failure(response, format)
  const value = submissionObject(response.payload)
  const bytes = attempt.draft.files[0].sizeBytes
  const mode = format === 'video' && bytes >= videoMultipartThresholdBytes ? 'multipart' : 'put'
  const partSize = mode === 'multipart' ? videoPartSizeBytes : null
  if (value?.mode !== mode || (value.partSizeBytes ?? null) !== partSize || !isSubmissionInstant(value.completionDeadlineAt)
    || !Array.isArray(value.uploadedParts)) return failure(response, format)

  const count = mode === 'multipart' ? videoPartCount(bytes) : 1
  const uploadedParts = new Set<number>()
  for (const number of value.uploadedParts) {
    if (typeof number !== 'number' || !Number.isInteger(number) || number < 1 || number > count || uploadedParts.has(number)) {
      return failure(response, format)
    }
    uploadedParts.add(number)
  }
  return { kind: 'ready', mode, uploadedParts, completionDeadlineAt: value.completionDeadlineAt }
}

export async function authorizeMediaUpload(code: string, attempt: MediaAttempt, partNumber: number | null, signal: AbortSignal) {
  const { format, files: [file] } = attempt.draft
  const checksum = partNumber === null ? file.sha256 : file.partSha256?.[partNumber - 1]
  if (checksum === undefined) return { kind: 'unknown' as const, retryAfterMs: 0 }
  const response = await postJson(filePath(code, attempt) + '/upload-authorizations', partNumber === null ? {} : { partNumber },
    undefined, signal, attempt.authorization)
  if (response.kind !== 'ok') return failure(response, format)
  const mediaType = partNumber === null ? file.declaredMediaType : null
  return readUploadAuthorization(response.payload, mediaType, checksum) ?? failure(response, format)
}

export async function completeMediaSubmission(code: string, attempt: MediaAttempt, signal: AbortSignal): Promise<MediaStatus> {
  const response = await postJson(submissionAttemptPath(code, attempt) + '/completion', {}, undefined, signal, attempt.authorization)
  return status(response, attempt.draft.format)
}
