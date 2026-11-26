import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { MediaSubmission } from './mediaSubmissionService'
import { submissionChecksum } from './submissionChecksum'
import { useAudioSubmission } from './useAudioSubmission'

vi.mock('../../config/environment', () => ({
  environment: { apiBaseUrl: '', submissionUploadOrigin: 'https://upload.example' },
}))
vi.mock('./submissionChecksum', () => ({ submissionChecksum: vi.fn() }))

const admissionPath = '/api/v1/public-events/event/submissions'
const deadline = '2032-03-01T16:00:00Z'
const confirmedAt = '2032-03-01T16:02:00Z'
const sha256 = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
const uploadUrl = 'https://upload.example/temporary/audio?grant'
const file = new File(['voice'], 'rascunho-protegido.m4a', { type: 'audio/mp4' })
const draft = {
  category: 'testimonial' as const,
  file,
  declaredMediaType: file.type,
  caption: null,
  identification: { guestName: 'Convidada', noticeCode: 'fixture', consentProof: 'prova' },
}

class AudioRequest {
  static requests: AudioRequest[] = []
  readonly open = vi.fn()
  readonly setRequestHeader = vi.fn()
  readonly send = vi.fn<(bytes: Blob) => void>()
  readonly abort = vi.fn(() => this.onabort?.())
  readonly upload: { onprogress?: (event: ProgressEvent) => void } = {}
  status = 0
  onload?: () => void
  onerror?: () => void
  onabort?: () => void

  constructor() {
    AudioRequest.requests.push(this)
  }

  progress(loaded: number) {
    this.upload.onprogress?.(new ProgressEvent('progress', { loaded }))
  }

  finish() {
    this.status = 200
    this.onload?.()
  }
}

const fetchApi = vi.fn<typeof fetch>()

function status(state: string) {
  return Response.json({ state })
}

function uploadStatus(uploadedParts: number[]) {
  return Response.json({ mode: 'put', uploadedParts, completionDeadlineAt: deadline })
}

function grant() {
  return Response.json({
    method: 'PUT', url: uploadUrl, expiresAt: deadline,
    headers: { 'Content-Type': file.type, 'x-amz-checksum-sha256': sha256 },
  })
}

function attempt() {
  const [, options] = fetchApi.mock.calls[0]!
  const headers = new Headers(options?.headers)
  const key = headers.get('Idempotency-Key')
  const authorization = headers.get('Authorization')
  const manifest = JSON.parse(String(options?.body)) as MediaSubmission<'audio'>
  const path = admissionPath + '/' + key
  expect(key).toMatch(/^[0-9a-f-]{36}$/)
  expect(authorization).toMatch(/^Bearer [a-f0-9]{64}$/)
  for (const [, request] of fetchApi.mock.calls) {
    expect(request?.credentials).toBe('omit')
    expect(new Headers(request?.headers).get('Authorization')).toBe(authorization)
  }
  return { key, manifest, path, filePath: path + '/files/' + manifest.files[0].fileKey }
}

function setup() {
  const releaseDraft = vi.fn()
  return { ...renderHook(() => useAudioSubmission('event', releaseDraft)), releaseDraft }
}

async function poll() {
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance'] })
  fetchApi.mockReset()
  vi.mocked(submissionChecksum).mockReset().mockResolvedValue({ sha256, partSha256: [] })
  AudioRequest.requests = []
  vi.stubGlobal('fetch', fetchApi)
  vi.stubGlobal('XMLHttpRequest', AudioRequest)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('envia áudio no limite por PUT com checksum integral e libera o rascunho após o recibo confirmado', async () => {
  const largeFile = new File([new Uint8Array(50_000_000)], file.name, { type: file.type })
  const caption = '🎉'.repeat(500)
  fetchApi.mockResolvedValueOnce(status('receiving')).mockResolvedValueOnce(uploadStatus([]))
    .mockResolvedValueOnce(grant()).mockResolvedValueOnce(status('validating'))
    .mockResolvedValueOnce(status('confirmed'))
    .mockResolvedValueOnce(Response.json({ state: 'confirmed', confirmedAt }))
  const { result, releaseDraft } = setup()

  await act(async () => result.current.send({ ...draft, file: largeFile, caption }))

  expect(AudioRequest.requests).toHaveLength(1)
  const request = AudioRequest.requests[0]!
  expect(request.open).toHaveBeenCalledWith('PUT', uploadUrl)
  expect(request.send).toHaveBeenCalledWith(largeFile)
  expect(request.setRequestHeader.mock.calls).toEqual([
    ['Content-Type', file.type], ['x-amz-checksum-sha256', sha256],
  ])
  expect(submissionChecksum).toHaveBeenCalledWith(largeFile, null, expect.any(AbortSignal))
  act(() => request.progress(largeFile.size))
  expect(result.current.view).toEqual({
    kind: 'transferring', loaded: largeFile.size, total: largeFile.size, completionDeadlineAt: deadline,
  })
  expect(releaseDraft).not.toHaveBeenCalled()

  await act(async () => request.finish())
  expect(result.current.view).toEqual({ kind: 'validating' })
  await poll()
  expect(result.current.view).toEqual({ kind: 'validating' })
  expect(releaseDraft).not.toHaveBeenCalled()
  await poll()
  expect(result.current.view).toEqual({ kind: 'confirmed', confirmedAt })
  expect(releaseDraft).toHaveBeenCalledOnce()
  await poll()

  const { manifest, path, filePath } = attempt()
  expect(manifest).toEqual({
    category: 'testimonial', format: 'audio', caption, identification: draft.identification,
    files: [{ fileKey: expect.any(String), position: 1, declaredMediaType: file.type, sizeBytes: largeFile.size, sha256 }],
  })
  expect(fetchApi.mock.calls.map(([url]) => url)).toEqual([
    admissionPath, filePath + '/upload-status', filePath + '/upload-authorizations', path + '/completion', path, path,
  ])
  expect(fetchApi.mock.calls[2]?.[1]?.body).toBe('{}')
})

it('reconcilia a resposta perdida do PUT sem retransmitir o arquivo já reconhecido', async () => {
  fetchApi.mockResolvedValueOnce(status('receiving')).mockResolvedValueOnce(uploadStatus([]))
    .mockResolvedValueOnce(grant()).mockResolvedValueOnce(status('receiving'))
    .mockResolvedValueOnce(status('receiving')).mockResolvedValueOnce(uploadStatus([1]))
    .mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(status('validating'))
  const { result, releaseDraft } = setup()

  await act(async () => result.current.send(draft))
  await act(async () => AudioRequest.requests[0]!.onerror?.())
  expect(result.current.view).toEqual({ kind: 'interrupted', canRetry: true })
  await act(async () => result.current.retry())

  const { manifest, path, filePath } = attempt()
  expect(manifest).not.toHaveProperty('caption')
  expect(fetchApi.mock.calls.map(([url]) => url)).toEqual([
    admissionPath, filePath + '/upload-status', filePath + '/upload-authorizations', path,
    path, filePath + '/upload-status', path + '/completion', path,
  ])
  expect(result.current.view).toEqual({ kind: 'validating' })
  expect(AudioRequest.requests).toHaveLength(1)
  expect(submissionChecksum).toHaveBeenCalledOnce()
  expect(releaseDraft).not.toHaveBeenCalled()
})

it('reapresenta a mesma chave e o mesmo manifesto se a admissão se perde sem registro', async () => {
  fetchApi.mockRejectedValueOnce(new TypeError('offline'))
    .mockResolvedValueOnce(new Response(null, { status: 404 }))
    .mockResolvedValueOnce(new Response(null, { status: 404 }))
    .mockResolvedValueOnce(status('validating'))
  const { result } = setup()

  await act(async () => result.current.send(draft))
  expect(result.current.view).toEqual({ kind: 'interrupted', canRetry: true })
  await act(async () => result.current.retry())

  const { key, path } = attempt()
  expect(fetchApi.mock.calls.map(([url]) => url)).toEqual([admissionPath, path, path, admissionPath])
  const [, retried] = fetchApi.mock.calls[3]!
  expect(new Headers(retried?.headers).get('Idempotency-Key')).toBe(key)
  expect(retried?.body).toBe(fetchApi.mock.calls[0]?.[1]?.body)
  expect(submissionChecksum).toHaveBeenCalledOnce()
})

it.each([0, 50_000_001])('recusa áudio de %i bytes antes de calcular o hash ou consultar a API', async size => {
  const invalidFile = new File([], file.name, { type: file.type })
  Object.defineProperty(invalidFile, 'size', { value: size })
  const { result } = setup()

  await act(async () => result.current.send({ ...draft, file: invalidFile }))

  expect(result.current.view).toMatchObject({ kind: 'error', message: expect.stringContaining('áudio') })
  expect(submissionChecksum).not.toHaveBeenCalled()
  expect(fetchApi).not.toHaveBeenCalled()
})

it('recusa autorização multipart no estado de um áudio', async () => {
  fetchApi.mockResolvedValueOnce(status('receiving')).mockResolvedValueOnce(Response.json({
    mode: 'multipart', partSizeBytes: 16 * 1024 * 1024, uploadedParts: [], completionDeadlineAt: deadline,
  }))
  const { result } = setup()

  await act(async () => result.current.send(draft))

  expect(result.current.view).toEqual({ kind: 'interrupted', canRetry: true })
  expect(fetchApi).toHaveBeenCalledTimes(2)
  expect(AudioRequest.requests).toHaveLength(0)
})

it.each([
  { code: 'audio-invalid', kind: 'error', message: 'não passou na validação' },
  { code: 'audio-resource-budget', kind: 'error', message: 'limites de processamento' },
  { code: 'audio-received-late', kind: 'expired' },
])('encerra a tentativa com $code sem liberar o rascunho como confirmado', async ({ code, kind, message }) => {
  fetchApi.mockResolvedValueOnce(status('validating'))
    .mockResolvedValueOnce(Response.json({ state: 'rejected', code }))
  const { result, releaseDraft } = setup()

  await act(async () => result.current.send(draft))
  await poll()
  expect(result.current.view).toMatchObject({ kind, ...(message ? { message: expect.stringContaining(message) } : {}) })
  await act(async () => result.current.retry())
  await poll()

  expect(fetchApi).toHaveBeenCalledTimes(2)
  expect(releaseDraft).not.toHaveBeenCalled()
})

it('aborta o PUT ao descartar o rascunho e ignora a resposta atrasada', async () => {
  fetchApi.mockResolvedValueOnce(status('receiving')).mockResolvedValueOnce(uploadStatus([])).mockResolvedValueOnce(grant())
  const { result, releaseDraft } = setup()

  await act(async () => result.current.send(draft))
  const request = AudioRequest.requests[0]!
  act(() => result.current.reset())
  await act(async () => request.finish())
  await poll()

  expect(request.abort).toHaveBeenCalledOnce()
  expect(result.current.view).toEqual({ kind: 'idle' })
  expect(fetchApi).toHaveBeenCalledTimes(3)
  expect(releaseDraft).not.toHaveBeenCalled()
})
