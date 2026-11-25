import type { PhotoUploadAuthorization } from './photoSubmissionService'

type Result = 'transferred' | 'authorization-failed' | 'interrupted' | 'cancelled'
const inactivityLimit = 30_000

export function uploadPhoto(
  authorization: PhotoUploadAuthorization, file: File, signal: AbortSignal, progress: (loaded: number) => void,
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
      xhr.setRequestHeader('Content-Type', authorization.mediaType)
      xhr.setRequestHeader('x-amz-checksum-sha256', authorization.checksum)
      resetWatchdog()
      xhr.send(file)
    } catch {
      finish('interrupted')
    }
  })
}
