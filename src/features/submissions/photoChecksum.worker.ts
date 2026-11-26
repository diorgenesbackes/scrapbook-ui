import { sha256 } from '@noble/hashes/sha2.js'

const chunkSize = 256 * 1024

self.addEventListener('message', async (event: MessageEvent<Blob>) => {
  const file = event.data
  try {
    const hash = sha256.create()
    for (let offset = 0; offset < file.size; offset += chunkSize) {
      const bytes = await file.slice(offset, offset + chunkSize).arrayBuffer()
      hash.update(new Uint8Array(bytes))
    }
    self.postMessage(btoa(String.fromCharCode(...hash.digest())))
  } catch {
    self.postMessage(null)
  }
})
