import type { SubmissionAttempt } from './submissionService'
import { uploadFile } from './submissionUpload'
import { videoPartCount, videoPartSizeBytes } from './videoParts'
import { authorizeVideoUpload, type VideoFailure, type VideoSubmission, type VideoUploadStatus } from './videoSubmissionService'

type TransferResult = VideoFailure | { kind: 'transferred' } | { kind: 'interrupted' }

export async function uploadVideo(
  eventCode: string, attempt: SubmissionAttempt<VideoSubmission>, file: File, status: VideoUploadStatus, signal: AbortSignal,
  progress: (loaded: number) => void,
): Promise<TransferResult> {
  const multipart = status.mode === 'multipart'
  const parts = Array.from({ length: videoPartCount(file.size) }, (_, index) => {
    const start = multipart ? index * videoPartSizeBytes : 0
    const end = multipart ? Math.min(file.size, start + videoPartSizeBytes) : file.size
    return { number: index + 1, start, end, size: end - start }
  })
  let recognizedBytes = parts.reduce((sum, part) => sum + (status.uploadedParts.has(part.number) ? part.size : 0), 0)
  progress(recognizedBytes)
  for (const part of parts) {
    if (signal.aborted) return { kind: 'cancelled' }
    if (status.uploadedParts.has(part.number)) continue
    const grant = await authorizeVideoUpload(eventCode, attempt, multipart ? part.number : null, signal)
    if (signal.aborted) return { kind: 'cancelled' }
    if (grant.kind !== 'authorized') return grant
    const bytes = multipart ? file.slice(part.start, part.end) : file
    const result = await uploadFile(grant, bytes, signal, loaded => progress(recognizedBytes + loaded))
    if (result === 'cancelled') return { kind: 'cancelled' }
    if (result !== 'transferred') return { kind: 'interrupted' }
    recognizedBytes += part.size
  }
  return { kind: 'transferred' }
}
