import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useVideoSubmission } from './useVideoSubmission'
import { videoChecksum } from './videoChecksum'
import type { VideoSubmission } from './videoSubmissionService'

vi.mock('../../config/environment', () => ({
  environment: { apiBaseUrl: '', submissionUploadOrigin: 'https://upload.example' },
}))
vi.mock('./videoChecksum', () => ({ videoChecksum: vi.fn() }))

const admissionPath = '/api/v1/public-events/event/submissions'
const deadline = '2032-03-01T16:00:00Z'
const confirmedAt = '2032-03-01T16:02:00Z'
const wholeSha256 = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
const partSha256 = [
  'BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  'DAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
]
const partSize = 16 * 1024 * 1024
const singleFile = new File(['video'], 'arquivo-local.mp4', { type: 'video/mp4' })
const draft = {
  category: 'testimonial' as const,
  file: singleFile,
  declaredMediaType: singleFile.type,
  caption: null,
  identification: { guestName: 'Convidada', noticeCode: 'fixture', consentProof: 'prova' },
}

class VideoRequest {
  static requests: VideoRequest[] = []
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
    VideoRequest.requests.push(this)
  }

  progress(loaded: number) {
    this.upload.onprogress?.(new ProgressEvent('progress', { loaded }))
  }

  finish(status: number) {
    this.status = status
    this.onload?.()
  }
}

const fetchApi = vi.fn<typeof fetch>()
const receiving = () => Response.json({ state: 'receiving' })
const validating = () => Response.json({ state: 'validating' })
const confirmed = () => Response.json({ state: 'confirmed', confirmedAt })

function uploadStatus(mode: 'put' | 'multipart', uploadedParts: number[]) {
  return Response.json({
    mode,
    uploadedParts,
    completionDeadlineAt: deadline,
    ...(mode === 'multipart' ? { partSizeBytes: partSize } : {}),
  })
}

function grant(label: string, checksum: string, mediaType?: string) {
  return Response.json({
    method: 'PUT',
    url: 'https://upload.example/temporary/video?' + label,
    expiresAt: deadline,
    headers: { ...(mediaType ? { 'Content-Type': mediaType } : {}), 'x-amz-checksum-sha256': checksum },
  })
}

function attempt() {
  const [, options] = fetchApi.mock.calls[0]!
  const headers = new Headers(options?.headers)
  const key = headers.get('Idempotency-Key')
  const authorization = headers.get('Authorization')
  const manifest = JSON.parse(String(options?.body)) as VideoSubmission
  const path = admissionPath + '/' + key
  const filePath = path + '/files/' + manifest.files[0].fileKey
  expect(key).toMatch(/^[0-9a-f-]{36}$/)
  expect(authorization).toMatch(/^Bearer [a-f0-9]{64}$/)
  for (const [, request] of fetchApi.mock.calls) {
    expect(request?.credentials).toBe('omit')
    expect(new Headers(request?.headers).get('Authorization')).toBe(authorization)
  }
  return { key, manifest, path, filePath }
}

function setup() {
  const onConfirmed = vi.fn()
  return { ...renderHook(() => useVideoSubmission('event', onConfirmed)), onConfirmed }
}

function multipartFile() {
  return new File(
    [new Uint8Array(partSize).fill(1), new Uint8Array(partSize).fill(2), Uint8Array.of(3, 4, 5)],
    'arquivo-local.webm', { type: 'video/webm' },
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance'] })
  fetchApi.mockReset()
  vi.mocked(videoChecksum).mockReset().mockResolvedValue({ sha256: wholeSha256, partSha256: [] })
  VideoRequest.requests = []
  vi.stubGlobal('fetch', fetchApi)
  vi.stubGlobal('XMLHttpRequest', VideoRequest)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('transfere um vídeo pequeno em um PUT, separa validação e só exibe recibo após confirmação', async () => {
  fetchApi.mockResolvedValueOnce(receiving()).mockResolvedValueOnce(uploadStatus('put', []))
    .mockResolvedValueOnce(grant('single', wholeSha256, singleFile.type)).mockResolvedValueOnce(validating())
    .mockResolvedValueOnce(Response.json({ state: 'confirmed', confirmedAt: 'inválido' }))
    .mockResolvedValueOnce(confirmed())
  const { result, onConfirmed } = setup()

  await act(async () => result.current.send(draft))

  const request = VideoRequest.requests[0]!
  expect(request.open).toHaveBeenCalledWith('PUT', 'https://upload.example/temporary/video?single')
  expect(request.send).toHaveBeenCalledWith(singleFile)
  expect(request.setRequestHeader.mock.calls).toEqual([
    ['Content-Type', singleFile.type], ['x-amz-checksum-sha256', wholeSha256],
  ])
  act(() => request.progress(singleFile.size))
  expect(result.current.view).toEqual({ kind: 'transferring', loaded: singleFile.size, total: singleFile.size, completionDeadlineAt: deadline })
  expect(onConfirmed).not.toHaveBeenCalled()
  expect(fetchApi).toHaveBeenCalledTimes(3)

  await act(async () => request.finish(200))

  expect(result.current.view).toEqual({ kind: 'validating' })
  expect(onConfirmed).not.toHaveBeenCalled()
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
  expect(result.current.view).toEqual({ kind: 'validating' })
  expect(onConfirmed).not.toHaveBeenCalled()
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
  expect(result.current.view).toEqual({ kind: 'confirmed', confirmedAt })
  expect(onConfirmed).toHaveBeenCalledOnce()
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })

  const { manifest, path, filePath } = attempt()
  expect(manifest).toEqual({
    category: 'testimonial', format: 'video', identification: draft.identification,
    files: [{ fileKey: expect.any(String), position: 1, declaredMediaType: singleFile.type, sizeBytes: singleFile.size, sha256: wholeSha256 }],
  })
  expect(fetchApi.mock.calls.map(([url]) => url)).toEqual([
    admissionPath, filePath + '/upload-status', filePath + '/upload-authorizations', path + '/completion', path, path,
  ])
  expect(fetchApi.mock.calls[2]?.[1]?.body).toBe('{}')
})

it('recupera a mesma tentativa e transmite somente partes pendentes conforme a lista atual do servidor', async () => {
  const file = multipartFile()
  const caption = '🎉'.repeat(500)
  vi.mocked(videoChecksum).mockResolvedValue({ sha256: wholeSha256, partSha256 })
  fetchApi.mockResolvedValueOnce(receiving()).mockResolvedValueOnce(uploadStatus('multipart', [1]))
    .mockResolvedValueOnce(grant('second', partSha256[1]!)).mockResolvedValueOnce(receiving())
    .mockResolvedValueOnce(receiving()).mockResolvedValueOnce(uploadStatus('multipart', [2, 1]))
    .mockResolvedValueOnce(grant('last', partSha256[2]!)).mockResolvedValueOnce(validating())
    .mockResolvedValueOnce(confirmed())
  const { result, onConfirmed } = setup()

  await act(async () => {
    result.current.send({ ...draft, category: 'moment', file, declaredMediaType: file.type, caption })
    result.current.send(draft)
  })

  expect(result.current.view).toEqual({ kind: 'transferring', loaded: partSize, total: file.size, completionDeadlineAt: deadline })
  const second = VideoRequest.requests[0]!
  expect(second.send.mock.calls[0]?.[0].size).toBe(partSize)
  expect(second.setRequestHeader.mock.calls).toEqual([['x-amz-checksum-sha256', partSha256[1]]])
  act(() => second.progress(5))
  act(() => second.progress(5))
  act(() => second.progress(2))
  expect(result.current.view).toMatchObject({ kind: 'transferring', loaded: partSize + 5 })
  await act(async () => second.onerror?.())
  expect(result.current.view).toEqual({ kind: 'interrupted', canRetry: true })

  await act(async () => result.current.retry())

  const last = VideoRequest.requests[1]!
  const lastBytes = last.send.mock.calls[0]![0]
  expect(lastBytes.size).toBe(3)
  expect(new Uint8Array(await lastBytes.arrayBuffer())).toEqual(Uint8Array.of(3, 4, 5))
  expect(last.setRequestHeader.mock.calls).toEqual([['x-amz-checksum-sha256', partSha256[2]]])
  expect(result.current.view).toMatchObject({ kind: 'transferring', loaded: 2 * partSize, total: file.size })
  act(() => last.progress(10))
  expect(result.current.view).toMatchObject({ kind: 'transferring', loaded: file.size })
  expect(onConfirmed).not.toHaveBeenCalled()

  await act(async () => last.finish(200))
  expect(result.current.view).toEqual({ kind: 'validating' })
  expect(onConfirmed).not.toHaveBeenCalled()
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
  expect(result.current.view).toEqual({ kind: 'confirmed', confirmedAt })
  expect(onConfirmed).toHaveBeenCalledOnce()

  const { manifest, path, filePath } = attempt()
  expect(manifest).toEqual({
    category: 'moment', format: 'video', identification: draft.identification, caption,
    files: [{ fileKey: expect.any(String), position: 1, declaredMediaType: file.type, sizeBytes: file.size, sha256: wholeSha256, partSha256 }],
  })
  const authorizations = filePath + '/upload-authorizations'
  expect(fetchApi.mock.calls.map(([url]) => url)).toEqual([
    admissionPath, filePath + '/upload-status', authorizations, path,
    path, filePath + '/upload-status', authorizations, path + '/completion', path,
  ])
  expect(fetchApi.mock.calls.filter(([url]) => url === authorizations).map(([, options]) => options?.body))
    .toEqual(['{"partNumber":2}', '{"partNumber":3}'])
  expect(VideoRequest.requests).toHaveLength(2)
  expect(videoChecksum).toHaveBeenCalledOnce()
})

it('reapresenta o mesmo manifesto e a mesma chave quando a admissão se perde e a tentativa não existe', async () => {
  fetchApi.mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(new Response(null, { status: 404 }))
    .mockResolvedValueOnce(new Response(null, { status: 404 })).mockResolvedValueOnce(confirmed())
  const { result, onConfirmed } = setup()

  await act(async () => result.current.send(draft))
  expect(result.current.view).toEqual({ kind: 'interrupted', canRetry: true })
  await act(async () => result.current.retry())

  const { path, key } = attempt()
  expect(fetchApi.mock.calls.map(([url]) => url)).toEqual([admissionPath, path, path, admissionPath])
  const [, firstOptions] = fetchApi.mock.calls[0]!
  const [, secondOptions] = fetchApi.mock.calls[3]!
  expect(new Headers(secondOptions?.headers).get('Idempotency-Key')).toBe(key)
  expect(secondOptions?.body).toBe(firstOptions?.body)
  expect(VideoRequest.requests).toHaveLength(0)
  expect(videoChecksum).toHaveBeenCalledOnce()
  expect(onConfirmed).toHaveBeenCalledOnce()
})

it('finaliza sem retransmitir após a API reconhecer todos os bytes de um PUT cuja resposta se perdeu', async () => {
  fetchApi.mockResolvedValueOnce(receiving()).mockResolvedValueOnce(uploadStatus('put', []))
    .mockResolvedValueOnce(grant('single', wholeSha256, singleFile.type)).mockResolvedValueOnce(receiving())
    .mockResolvedValueOnce(receiving()).mockResolvedValueOnce(uploadStatus('put', [1]))
    .mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(validating())
  const { result, onConfirmed } = setup()

  await act(async () => result.current.send(draft))
  await act(async () => VideoRequest.requests[0]!.onerror?.())
  await act(async () => result.current.retry())

  const { path, filePath } = attempt()
  expect(fetchApi.mock.calls.map(([url]) => url)).toEqual([
    admissionPath, filePath + '/upload-status', filePath + '/upload-authorizations', path,
    path, filePath + '/upload-status', path + '/completion', path,
  ])
  expect(result.current.view).toEqual({ kind: 'validating' })
  expect(VideoRequest.requests).toHaveLength(1)
  expect(onConfirmed).not.toHaveBeenCalled()
})

it('enquanto o servidor reconcilia o prazo, permite apenas consultar a tentativa', async () => {
  fetchApi.mockResolvedValueOnce(receiving()).mockResolvedValueOnce(
    Response.json({ code: 'UPLOAD_COMPLETION_DEADLINE_EXCEEDED' }, { status: 409 }),
  ).mockResolvedValueOnce(receiving()).mockResolvedValueOnce(Response.json({ state: 'expired' }))
  const { result, onConfirmed } = setup()

  await act(async () => result.current.send(draft))
  expect(result.current.view).toEqual({ kind: 'reconciling' })
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
  expect(result.current.view).toEqual({ kind: 'reconciling' })
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
  expect(result.current.view).toEqual({ kind: 'expired' })
  await act(async () => result.current.retry())
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })

  const { path, filePath } = attempt()
  expect(fetchApi.mock.calls.map(([url]) => url)).toEqual([admissionPath, filePath + '/upload-status', path, path])
  expect(VideoRequest.requests).toHaveLength(0)
  expect(onConfirmed).not.toHaveBeenCalled()
})

it.each([
  { mode: 'multipart', uploadedParts: [], partSizeBytes: partSize, completionDeadlineAt: deadline },
  { mode: 'put', uploadedParts: [], partSizeBytes: partSize, completionDeadlineAt: deadline },
  { mode: 'put', uploadedParts: [], completionDeadlineAt: 'incompleto' },
  { mode: 'put', uploadedParts: '1', completionDeadlineAt: deadline },
  { mode: 'put', uploadedParts: [2], completionDeadlineAt: deadline },
  { mode: 'put', uploadedParts: [1, 1], completionDeadlineAt: deadline },
  { mode: 'put', uploadedParts: [0], completionDeadlineAt: deadline },
  { mode: 'put', uploadedParts: [1.5], completionDeadlineAt: deadline },
])('interrompe a transferência se o estado de upload for inválido (%j)', async status => {
  fetchApi.mockResolvedValueOnce(receiving()).mockResolvedValueOnce(Response.json(status))
  const { result } = setup()

  await act(async () => result.current.send(draft))

  expect(result.current.view).toEqual({ kind: 'interrupted', canRetry: true })
  expect(fetchApi).toHaveBeenCalledTimes(2)
  expect(VideoRequest.requests).toHaveLength(0)
})

it('aguarda Retry-After antes de consultar ou repetir a admissão', async () => {
  fetchApi.mockResolvedValueOnce(Response.json({}, { status: 429, headers: { 'Retry-After': '10' } }))
    .mockResolvedValueOnce(confirmed())
  const { result, onConfirmed } = setup()

  await act(async () => result.current.send(draft))
  expect(result.current.view).toEqual({ kind: 'interrupted', canRetry: false })
  await act(async () => result.current.retry())
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
  expect(fetchApi).toHaveBeenCalledOnce()
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })

  expect(fetchApi).toHaveBeenCalledTimes(2)
  expect(result.current.view).toEqual({ kind: 'confirmed', confirmedAt })
  expect(onConfirmed).toHaveBeenCalledOnce()
})

it('aborta a transferência e cancela consultas quando a tentativa é descartada', async () => {
  fetchApi.mockResolvedValueOnce(receiving()).mockResolvedValueOnce(uploadStatus('put', []))
    .mockResolvedValueOnce(grant('single', wholeSha256, singleFile.type))
  const { result, onConfirmed } = setup()

  await act(async () => result.current.send(draft))
  const request = VideoRequest.requests[0]!
  await act(async () => result.current.reset())
  await act(async () => { await vi.advanceTimersByTimeAsync(35_000) })

  expect(request.abort).toHaveBeenCalledOnce()
  expect(result.current.view).toEqual({ kind: 'idle' })
  expect(fetchApi).toHaveBeenCalledTimes(3)
  expect(onConfirmed).not.toHaveBeenCalled()
})

it('ignora uma confirmação atrasada após desmontar a tela durante uma consulta', async () => {
  let respondToPoll!: (response: Response) => void
  const pending = new Promise<Response>(resolve => { respondToPoll = resolve })
  fetchApi.mockResolvedValueOnce(receiving()).mockResolvedValueOnce(uploadStatus('put', [1]))
    .mockResolvedValueOnce(validating()).mockReturnValueOnce(pending)
  const { result, unmount, onConfirmed } = setup()

  await act(async () => result.current.send(draft))
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
  const signal = fetchApi.mock.calls[3]?.[1]?.signal
  expect(signal?.aborted).toBe(false)

  unmount()
  respondToPoll(confirmed())
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })

  expect(signal?.aborted).toBe(true)
  expect(fetchApi).toHaveBeenCalledTimes(4)
  expect(onConfirmed).not.toHaveBeenCalled()
})
