import { submissionObject } from './submissionService'

type Checksums = { sha256: string; partSha256: string[] }

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9+/]{43}=$/.test(value)
}

function readChecksums(value: unknown, expectedParts: number): Checksums | null {
  const result = submissionObject(value)
  if (!isSha256(result?.sha256) || !Array.isArray(result.partSha256) || result.partSha256.length !== expectedParts
    || !result.partSha256.every(isSha256)) return null
  return { sha256: result.sha256, partSha256: result.partSha256 }
}

export function submissionChecksum(file: Blob, partSizeBytes: number | null, signal: AbortSignal): Promise<Checksums | null> {
  return new Promise(resolve => {
    if (signal.aborted) {
      resolve(null)
      return
    }

    let worker: Worker | undefined
    function finish(value: Checksums | null) {
      signal.removeEventListener('abort', cancel)
      worker?.terminate()
      resolve(value)
    }

    function cancel() { finish(null) }

    try {
      const expectedParts = partSizeBytes === null ? 0 : Math.ceil(file.size / partSizeBytes)
      worker = new Worker(new URL('./submissionChecksum.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (event: MessageEvent<unknown>) => finish(readChecksums(event.data, expectedParts))
      worker.onerror = event => {
        event.preventDefault()
        cancel()
      }
      worker.onmessageerror = cancel
      signal.addEventListener('abort', cancel, { once: true })
      worker.postMessage({ file: file.slice(), partSizeBytes })
    } catch {
      cancel()
    }
  })
}
