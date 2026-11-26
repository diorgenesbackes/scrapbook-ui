import { environment } from '../../config/environment'
import { isSubmissionInstant, submissionObject } from './submissionService'

type Result = 'transferred' | 'authorization-failed' | 'interrupted' | 'cancelled'
const inactivityLimit = 30_000

type UploadAuthorization = {
  kind: 'authorized'
  url: string
  mediaType: string | null
  checksum: string
  expiresAt: string
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

export function readUploadAuthorization(value: unknown, mediaType: string | null, checksum: string): UploadAuthorization | null {
  const grant = submissionObject(value)
  if (grant?.method !== 'PUT' || !isSubmissionInstant(grant.expiresAt)) return null
  const url = uploadUrl(grant.url)
  const headers = Object.entries(submissionObject(grant.headers) ?? {})
  const authorizedType = headers.find(([name]) => name.toLowerCase() === 'content-type')?.[1]
  const authorizedChecksum = headers.find(([name]) => name.toLowerCase() === 'x-amz-checksum-sha256')?.[1]
  const hasExpectedType = mediaType === null ? authorizedType === undefined : authorizedType === mediaType
  return url && headers.length === (mediaType === null ? 1 : 2) && hasExpectedType && authorizedChecksum === checksum
    ? { kind: 'authorized', url, mediaType, checksum, expiresAt: grant.expiresAt }
    : null
}

export function uploadFile(
  authorization: UploadAuthorization, file: Blob, signal: AbortSignal, progress: (loaded: number) => void,
): Promise<Result> {
  return new Promise(resolve => {
    if (signal.aborted) {
      resolve('cancelled')
      return
    }

    let request: XMLHttpRequest | undefined
    let watchdog: number | undefined
    let sentBytes = 0

    function finish(result: Result) {
      window.clearTimeout(watchdog)
      signal.removeEventListener('abort', abort)
      if (request) {
        request.upload.onprogress = null
        request.onload = null
        request.onerror = null
        request.onabort = null
      }
      resolve(result)
    }

    function stop(result: 'interrupted' | 'cancelled') {
      finish(result)
      request?.abort()
    }

    function abort() {
      stop('cancelled')
    }

    function resetWatchdog() {
      window.clearTimeout(watchdog)
      watchdog = window.setTimeout(() => stop('interrupted'), inactivityLimit)
    }

    try {
      const xhr = new XMLHttpRequest()
      request = xhr
      xhr.upload.onprogress = event => {
        const loaded = Math.min(event.loaded, file.size)
        if (loaded <= sentBytes) return
        sentBytes = loaded
        resetWatchdog()
        progress(loaded)
      }
      xhr.onload = () => {
        const status = xhr.status
        if (status >= 200 && status < 300) {
          if (sentBytes < file.size) progress(file.size)
          finish('transferred')
        } else {
          finish(status === 401 || status === 403 ? 'authorization-failed' : 'interrupted')
        }
      }
      xhr.onerror = () => finish('interrupted')
      xhr.onabort = () => finish('cancelled')
      signal.addEventListener('abort', abort, { once: true })
      xhr.open('PUT', authorization.url)
      if (authorization.mediaType !== null) xhr.setRequestHeader('Content-Type', authorization.mediaType)
      xhr.setRequestHeader('x-amz-checksum-sha256', authorization.checksum)
      resetWatchdog()
      xhr.send(file)
    } catch {
      finish('interrupted')
    }
  })
}
