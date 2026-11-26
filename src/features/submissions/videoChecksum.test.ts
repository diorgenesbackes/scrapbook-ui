import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { videoChecksum } from './videoChecksum'

const checksum = 'HRazIos9glLXEyhMElh7KPa4F36Lh8peVMO6+9HepBI='

class ChecksumWorker {
  static workers: ChecksumWorker[] = []
  readonly postMessage = vi.fn<(data: { file: Blob; partSizeBytes: number | null }) => void>()
  readonly terminate = vi.fn()
  onmessage?: (event: MessageEvent<unknown>) => void
  onerror?: (event: ErrorEvent) => void
  onmessageerror?: () => void

  constructor() {
    ChecksumWorker.workers.push(this)
  }

  respond(data: unknown) {
    this.onmessage?.(new MessageEvent('message', { data }))
  }
}

function fileWithSize(size: number) {
  const file = new File(['video'], 'fixture.mp4', { type: 'video/mp4' })
  vi.spyOn(file, 'size', 'get').mockReturnValue(size)
  return file
}

beforeEach(() => {
  ChecksumWorker.workers = []
  vi.stubGlobal('Worker', ChecksumWorker)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it.each([
  { bytes: 32 * 1024 * 1024 - 1, partSizeBytes: null, count: 0 },
  { bytes: 32 * 1024 * 1024, partSizeBytes: 16 * 1024 * 1024, count: 2 },
  { bytes: 32 * 1024 * 1024 + 1, partSizeBytes: 16 * 1024 * 1024, count: 3 },
  { bytes: 500_000_000, partSizeBytes: 16 * 1024 * 1024, count: 30 },
])('pede ao worker o hash integral e $count hashes de partes para $bytes bytes', async ({ bytes, partSizeBytes, count }) => {
  const file = fileWithSize(bytes)
  const result = videoChecksum(file, new AbortController().signal)

  const worker = ChecksumWorker.workers[0]!
  const payload = worker.postMessage.mock.calls[0]?.[0]
  expect(payload?.partSizeBytes).toBe(partSizeBytes)
  expect(payload?.file).toBeInstanceOf(Blob)
  expect(payload?.file).not.toBeInstanceOf(File)
  const hashes = { sha256: checksum, partSha256: Array<string>(count).fill(checksum) }
  worker.respond(hashes)

  await expect(result).resolves.toEqual(hashes)
  expect(worker.terminate).toHaveBeenCalledOnce()
})

it.each([0, 500_000_001])('rejeita %i bytes sem criar um worker', async bytes => {
  await expect(videoChecksum(fileWithSize(bytes), new AbortController().signal)).resolves.toBeNull()
  expect(ChecksumWorker.workers).toHaveLength(0)
})

it.each([
  null,
  { sha256: 'incompleto', partSha256: [checksum, checksum] },
  { sha256: checksum, partSha256: checksum },
  { sha256: checksum, partSha256: [checksum] },
  { sha256: checksum, partSha256: [checksum, 'incompleto'] },
])('rejeita uma resposta incorreta do worker (%j)', async payload => {
  const result = videoChecksum(fileWithSize(32 * 1024 * 1024), new AbortController().signal)
  const worker = ChecksumWorker.workers[0]!
  worker.respond(payload)

  await expect(result).resolves.toBeNull()
  expect(worker.terminate).toHaveBeenCalledOnce()
})

it('interrompe a preparação e termina o worker quando o sinal é cancelado', async () => {
  const controller = new AbortController()
  const result = videoChecksum(fileWithSize(5), controller.signal)
  controller.abort()

  await expect(result).resolves.toBeNull()
  expect(ChecksumWorker.workers[0]?.terminate).toHaveBeenCalledOnce()
  await expect(videoChecksum(fileWithSize(5), controller.signal)).resolves.toBeNull()
  expect(ChecksumWorker.workers).toHaveLength(1)
})

it('encerra a preparação quando o worker falha', async () => {
  const result = videoChecksum(fileWithSize(5), new AbortController().signal)
  const worker = ChecksumWorker.workers[0]!
  const event = new ErrorEvent('error', { cancelable: true })
  worker.onerror?.(event)

  await expect(result).resolves.toBeNull()
  expect(event.defaultPrevented).toBe(true)
  expect(worker.terminate).toHaveBeenCalledOnce()
})
