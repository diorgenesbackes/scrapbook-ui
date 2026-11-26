// @vitest-environment node
import { afterAll, beforeAll, expect, it, vi } from 'vitest'

type ChecksumRequest = MessageEvent<{ file: Blob; partSizeBytes: number | null }>

const postMessage = vi.fn()
let handleMessage!: (event: ChecksumRequest) => Promise<void>

beforeAll(async () => {
  vi.stubGlobal('self', {
    addEventListener(name: string, handler: typeof handleMessage) {
      expect(name).toBe('message')
      handleMessage = handler
    },
    postMessage,
  })
  await import('./submissionChecksum.worker')
})

afterAll(() => vi.unstubAllGlobals())

function hash(file: Blob, partSizeBytes: number | null) {
  postMessage.mockReset()
  return handleMessage(new MessageEvent('message', { data: { file, partSizeBytes } }))
}

it('calcula o SHA-256 integral e das partes, lendo em blocos limitados e incluindo a parte final menor', async () => {
  const chunkSize = 256 * 1024
  const file = new Blob([new Uint8Array(chunkSize + 5).fill(42)])
  const slice = vi.spyOn(file, 'slice')

  await hash(file, chunkSize + 2)

  expect(slice.mock.calls).toEqual([[0, chunkSize], [chunkSize, chunkSize + 2], [chunkSize + 2, chunkSize + 5]])
  expect(postMessage).toHaveBeenCalledExactlyOnceWith({
    sha256: 'HRazIos9glLXEyhMElh7KPa4F36Lh8peVMO6+9HepBI=',
    partSha256: ['1W6B8GXYx2DnAe1590Qx1nRtkE0c/sF72I9WLrOXtAc=', 'WW9BYqUvMVsq0PpT/TCidp0CpB7XQ5EjeQlm7uTOtc0='],
  })
})

it('envia só o hash integral quando não há partes', async () => {
  await hash(new Blob(['abc']), null)

  expect(postMessage).toHaveBeenCalledExactlyOnceWith({
    sha256: 'ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=',
    partSha256: [],
  })
})

it('encerra com falha quando os bytes do arquivo não podem ser lidos', async () => {
  const file = new Blob(['abc'])
  const chunk = file.slice()
  vi.spyOn(chunk, 'arrayBuffer').mockRejectedValue(new Error('fixture inacessível'))
  vi.spyOn(file, 'slice').mockReturnValue(chunk)

  await hash(file, null)

  expect(postMessage).toHaveBeenCalledExactlyOnceWith(null)
})
