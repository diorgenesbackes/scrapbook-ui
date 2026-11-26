import { sha256 } from '@noble/hashes/sha2.js'

const chunkSize = 256 * 1024

function encode(digest: Uint8Array) {
  return btoa(String.fromCharCode(...digest))
}

self.addEventListener('message', async (event: MessageEvent<{ file: Blob; partSizeBytes: number | null }>) => {
  const { file, partSizeBytes } = event.data
  try {
    const whole = sha256.create()
    const partSha256: string[] = []
    let offset = 0
    while (offset < file.size) {
      const end = Math.min(file.size, offset + (partSizeBytes ?? file.size))
      const part = partSizeBytes === null ? null : sha256.create()
      while (offset < end) {
        const next = Math.min(offset + chunkSize, end)
        const bytes = new Uint8Array(await file.slice(offset, next).arrayBuffer())
        whole.update(bytes)
        part?.update(bytes)
        offset = next
      }
      if (part) partSha256.push(encode(part.digest()))
    }
    self.postMessage({ sha256: encode(whole.digest()), partSha256 })
  } catch {
    self.postMessage(null)
  }
})
