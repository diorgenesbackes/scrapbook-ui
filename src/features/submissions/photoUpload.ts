import type { PhotoUploadAuthorization } from './photoSubmissionService'

type Result = 'transferred' | 'authorization-failed' | 'interrupted' | 'cancelled'

export function uploadPhoto(
  authorization: PhotoUploadAuthorization, file: File, signal: AbortSignal, progress: (loaded: number) => void,
): Promise<Result> {
  return new Promise(resolve => {
    if (signal.aborted) {
      resolve('cancelled')
      return
    }

    let request: XMLHttpRequest | undefined
    function finish(result: Result) {
      signal.removeEventListener('abort', abort)
      resolve(result)
    }

    function abort() {
      request?.abort()
      finish('cancelled')
    }

    try {
      const xhr = new XMLHttpRequest()
      request = xhr
      xhr.upload.onprogress = event => progress(Math.min(event.loaded, file.size))
      xhr.onload = () => {
        const status = xhr.status
        if (status >= 200 && status < 300) finish('transferred')
        else finish(status === 401 || status === 403 ? 'authorization-failed' : 'interrupted')
      }
      xhr.onerror = () => finish('interrupted')
      xhr.onabort = () => finish('cancelled')
      signal.addEventListener('abort', abort, { once: true })
      xhr.open('PUT', authorization.url)
      xhr.setRequestHeader('Content-Type', authorization.mediaType)
      xhr.setRequestHeader('x-amz-checksum-sha256', authorization.checksum)
      xhr.send(file)
    } catch {
      finish('interrupted')
    }
  })
}
