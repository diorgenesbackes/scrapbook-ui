import { submissionChecksum } from './submissionChecksum'
import { maxVideoBytes, videoMultipartThresholdBytes, videoPartSizeBytes } from './videoParts'

export function videoChecksum(file: File, signal: AbortSignal) {
  if (file.size === 0 || file.size > maxVideoBytes) return Promise.resolve(null)
  return submissionChecksum(file, file.size >= videoMultipartThresholdBytes ? videoPartSizeBytes : null, signal)
}
