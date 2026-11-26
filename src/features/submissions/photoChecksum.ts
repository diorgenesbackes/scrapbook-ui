export const sha256Base64 = /^[A-Za-z0-9+/]{43}=$/

export function photoChecksum(file: File, signal: AbortSignal): Promise<string | null> {
  return new Promise(resolve => {
    if (signal.aborted) {
      resolve(null)
      return
    }

    let worker: Worker | undefined
    function finish(value: string | null) {
      signal.removeEventListener('abort', cancel)
      worker?.terminate()
      resolve(value)
    }

    function cancel() { finish(null) }

    try {
      worker = new Worker(new URL('./photoChecksum.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (event: MessageEvent<unknown>) => {
        const data = event.data
        finish(typeof data === 'string' && sha256Base64.test(data) ? data : null)
      }
      worker.onerror = event => {
        event.preventDefault()
        cancel()
      }
      worker.onmessageerror = cancel
      signal.addEventListener('abort', cancel, { once: true })
      worker.postMessage(file.slice())
    } catch {
      cancel()
    }
  })
}
