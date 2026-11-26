import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { photoChecksum } from './photoChecksum'
import type { PhotoSubmission } from './photoSubmissionService'
import { usePhotoSubmission } from './usePhotoSubmission'

vi.mock('../../config/environment', () => ({
  environment: { apiBaseUrl: '', submissionUploadOrigin: 'https://upload.example' },
}))
vi.mock('./photoChecksum', () => ({ photoChecksum: vi.fn() }))

const api = '/api/v1/public-events/event/submissions'
const deadline = '2032-03-01T16:00:00Z'
const confirmedAt = '2032-03-01T16:02:00Z'
const checksum = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
const file = new File(['pict'], 'fixture.png', { type: 'image/png' })
const draft = {
  category: 'testimonial' as const, files: [{ file, declaredMediaType: file.type }], caption: 'Foto sintética',
  identification: { guestName: 'Convidada', noticeCode: 'fixture', consentProof: 'prova' },
}

class PhotoRequest {
  static requests: PhotoRequest[] = []
  readonly open = vi.fn()
  readonly setRequestHeader = vi.fn()
  readonly send = vi.fn()
  readonly abort = vi.fn(() => this.onabort?.())
  readonly upload: { onprogress?: (event: ProgressEvent) => void } = {}
  status = 0
  onload?: () => void
  onerror?: () => void
  onabort?: () => void

  constructor() {
    PhotoRequest.requests.push(this)
  }

  finish(status: number) {
    this.status = status
    this.onload?.()
  }
}

const fetchApi = vi.fn<typeof fetch>()
const receiving = () => Response.json({ state: 'receiving', completionDeadlineAt: deadline })
const validating = () => Response.json({ state: 'validating' })
const confirmed = () => Response.json({ state: 'confirmed', confirmedAt })

function authorize(query: string, origin = 'https://upload.example') {
  return Response.json({
    method: 'PUT', url: origin + '/temporary/photo?' + query, expiresAt: deadline,
    headers: { 'Content-Type': file.type, 'x-amz-checksum-sha256': checksum },
  })
}

function admittedAttempt() {
  const [, request] = fetchApi.mock.calls[0]!
  const headers = new Headers(request!.headers)
  const key = headers.get('Idempotency-Key')
  const authorization = headers.get('Authorization')
  const payload = JSON.parse(String(request!.body)) as PhotoSubmission
  const url = api + '/' + key
  const upload = url + '/files/' + payload.files[0]!.fileKey + '/upload-authorizations'
  expect(key).toBeTruthy()
  expect(authorization).toMatch(/^Bearer [a-f0-9]{64}$/)
  expect(payload).toMatchObject({
    category: 'testimonial', format: 'photo', caption: draft.caption, identification: draft.identification,
  })
  expect(payload.files).toEqual([
    { fileKey: expect.any(String), position: 1, declaredMediaType: file.type, sizeBytes: file.size, sha256: checksum },
  ])
  return { url, upload, authorization }
}

beforeEach(() => {
  fetchApi.mockReset()
  vi.mocked(photoChecksum).mockReset().mockResolvedValue(checksum)
  PhotoRequest.requests = []
  vi.stubGlobal('fetch', fetchApi)
  vi.stubGlobal('XMLHttpRequest', PhotoRequest)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('mede bytes, renova um PUT recusado na mesma tentativa e aguarda a confirmação do servidor', async () => {
  vi.useFakeTimers()
  fetchApi
    .mockResolvedValueOnce(receiving()).mockResolvedValueOnce(authorize('first'))
    .mockResolvedValueOnce(receiving()).mockResolvedValueOnce(authorize('renewed'))
    .mockResolvedValueOnce(validating()).mockResolvedValueOnce(confirmed())
  const onConfirmed = vi.fn()
  const { result } = renderHook(() => usePhotoSubmission('event', onConfirmed))

  await act(async () => result.current.send(draft))
  const first = PhotoRequest.requests[0]!
  expect(first.open).toHaveBeenCalledWith('PUT', 'https://upload.example/temporary/photo?first')
  expect(first.setRequestHeader.mock.calls).toEqual([
    ['Content-Type', file.type], ['x-amz-checksum-sha256', checksum],
  ])
  expect(first.send).toHaveBeenCalledWith(file)
  act(() => first.upload.onprogress?.(new ProgressEvent('progress', { loaded: 2, total: file.size })))
  expect(result.current.view).toEqual({ kind: 'transferring', loaded: 2, total: file.size, completionDeadlineAt: deadline })
  expect(onConfirmed).not.toHaveBeenCalled()

  await act(async () => first.finish(403))
  const renewed = PhotoRequest.requests[1]!
  expect(renewed.open).toHaveBeenCalledWith('PUT', 'https://upload.example/temporary/photo?renewed')
  expect(renewed.send).toHaveBeenCalledWith(file)
  await act(async () => renewed.finish(200))
  expect(result.current.view).toEqual({ kind: 'validating' })
  expect(onConfirmed).not.toHaveBeenCalled()

  await act(async () => vi.advanceTimersByTimeAsync(4_999))
  expect(fetchApi).toHaveBeenCalledTimes(5)
  await act(async () => vi.advanceTimersByTimeAsync(1))
  expect(result.current.view).toEqual({ kind: 'confirmed', confirmedAt })
  expect(onConfirmed).toHaveBeenCalledOnce()

  const { url, upload, authorization } = admittedAttempt()
  expect(fetchApi.mock.calls.map(([path]) => path)).toEqual([api, upload, url, upload, url + '/completion', url])
  for (const [, request] of fetchApi.mock.calls) {
    expect(new Headers(request!.headers).get('Authorization')).toBe(authorization)
  }
  expect(photoChecksum).toHaveBeenCalledOnce()
})

it('consulta a tentativa após perder as respostas da admissão e do PUT', async () => {
  fetchApi
    .mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(receiving())
    .mockResolvedValueOnce(authorize('first')).mockResolvedValueOnce(validating())
  const onConfirmed = vi.fn()
  const { result } = renderHook(() => usePhotoSubmission('event', onConfirmed))

  await act(async () => result.current.send(draft))
  await act(async () => PhotoRequest.requests[0]!.onerror?.())

  expect(result.current.view).toEqual({ kind: 'validating' })
  expect(onConfirmed).not.toHaveBeenCalled()
  const { url, upload, authorization } = admittedAttempt()
  expect(fetchApi.mock.calls.map(([path]) => path)).toEqual([api, url, upload, url])
  for (const [, request] of fetchApi.mock.calls) {
    expect(new Headers(request!.headers).get('Authorization')).toBe(authorization)
  }
  expect(PhotoRequest.requests).toHaveLength(1)
})

it('aborta a requisição PUT em andamento ao descartar o envio', async () => {
  fetchApi.mockResolvedValueOnce(receiving()).mockResolvedValueOnce(authorize('first'))
  const onConfirmed = vi.fn()
  const { result } = renderHook(() => usePhotoSubmission('event', onConfirmed))

  await act(async () => result.current.send(draft))
  const request = PhotoRequest.requests[0]!
  await act(async () => result.current.reset())

  expect(request.abort).toHaveBeenCalledOnce()
  expect(result.current.view).toEqual({ kind: 'idle' })
  expect(fetchApi).toHaveBeenCalledTimes(2)
  expect(onConfirmed).not.toHaveBeenCalled()
})

it('recusa uma autorização que aponta para outra origem de upload', async () => {
  fetchApi.mockResolvedValueOnce(receiving()).mockResolvedValueOnce(authorize('other', 'https://other.example'))
  const { result } = renderHook(() => usePhotoSubmission('event', vi.fn()))

  await act(async () => result.current.send(draft))

  expect(result.current.view).toEqual({ kind: 'interrupted', canRetry: true })
  expect(PhotoRequest.requests).toHaveLength(0)
  expect(fetchApi).toHaveBeenCalledTimes(2)
})

const momentFiles = [
  new File(['1234'], 'segunda-na-lista-de-nomes.png', { type: 'image/png' }),
  new File(['567890'], 'primeira-na-lista-de-nomes.png', { type: 'image/png' }),
  new File(['abc'], 'terceira.png', { type: 'image/png' }),
]
const momentDraft = {
  category: 'moment' as const,
  files: momentFiles.map(file => ({ file, declaredMediaType: file.type })),
  caption: 'Uma legenda para todas as fotos',
  identification: draft.identification,
}

function receivingMoment(pendingPositions: number[]) {
  return Response.json({ state: 'receiving', completionDeadlineAt: deadline, pendingPositions })
}

function expectMomentAttempt() {
  const [, request] = fetchApi.mock.calls[0]!
  const headers = new Headers(request!.headers)
  const key = headers.get('Idempotency-Key')
  const authorization = headers.get('Authorization')
  const payload = JSON.parse(String(request!.body)) as PhotoSubmission
  const url = api + '/' + key
  const keys = payload.files.map(({ fileKey }) => fileKey)

  expect(key).toBeTruthy()
  expect(authorization).toMatch(/^Bearer [a-f0-9]{64}$/)
  expect(payload).toEqual({
    category: 'moment',
    format: 'photo',
    caption: momentDraft.caption,
    identification: momentDraft.identification,
    files: momentFiles.map((file, index) => ({
      fileKey: expect.stringMatching(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i),
      position: index + 1,
      declaredMediaType: file.type,
      sizeBytes: file.size,
      sha256: checksum,
    })),
  })
  expect(new Set(keys).size).toBe(momentFiles.length)
  for (const [, call] of fetchApi.mock.calls) {
    expect(new Headers(call!.headers).get('Authorization')).toBe(authorization)
  }
  return { url, uploads: keys.map(fileKey => url + '/files/' + fileKey + '/upload-authorizations') }
}

it('envia o manifesto do momento na ordem revisada e soma apenas os bytes transferidos', async () => {
  vi.useFakeTimers()
  fetchApi
    .mockResolvedValueOnce(receivingMoment([1, 2, 3]))
    .mockResolvedValueOnce(authorize('first'))
    .mockResolvedValueOnce(authorize('second'))
    .mockResolvedValueOnce(authorize('third'))
    .mockResolvedValueOnce(validating())
    .mockResolvedValueOnce(confirmed())
  const onConfirmed = vi.fn()
  const { result } = renderHook(() => usePhotoSubmission('event', onConfirmed))

  await act(async () => result.current.send(momentDraft))

  const first = PhotoRequest.requests[0]!
  act(() => first.upload.onprogress?.(new ProgressEvent('progress', { loaded: 2, total: momentFiles[0]!.size })))
  expect(result.current.view).toEqual({ kind: 'transferring', loaded: 2, total: 13, completionDeadlineAt: deadline })

  await act(async () => first.finish(200))

  expect(result.current.view).toEqual({ kind: 'transferring', loaded: 4, total: 13, completionDeadlineAt: deadline })
  const second = PhotoRequest.requests[1]!
  act(() => second.upload.onprogress?.(new ProgressEvent('progress', { loaded: 3, total: momentFiles[1]!.size })))
  expect(result.current.view).toEqual({ kind: 'transferring', loaded: 7, total: 13, completionDeadlineAt: deadline })

  await act(async () => second.finish(200))

  expect(result.current.view).toEqual({ kind: 'transferring', loaded: 10, total: 13, completionDeadlineAt: deadline })
  expect(fetchApi).toHaveBeenCalledTimes(4)
  expect(onConfirmed).not.toHaveBeenCalled()

  await act(async () => PhotoRequest.requests[2]!.finish(200))

  expect(result.current.view).toEqual({ kind: 'validating' })
  expect(onConfirmed).not.toHaveBeenCalled()

  await act(async () => vi.advanceTimersByTimeAsync(5_000))

  expect(result.current.view).toEqual({ kind: 'confirmed', confirmedAt })
  expect(onConfirmed).toHaveBeenCalledOnce()
  expect(vi.mocked(photoChecksum).mock.calls.map(([file]) => file)).toEqual(momentFiles)
  expect(PhotoRequest.requests.map(request => request.send.mock.calls[0]![0])).toEqual(momentFiles)
  const { url, uploads } = expectMomentAttempt()
  expect(fetchApi.mock.calls.map(([path]) => path)).toEqual([api, ...uploads, url + '/completion', url])
})

it('consulta de novo antes de retomar e transfere apenas a posição ainda pendente na mesma tentativa', async () => {
  vi.useFakeTimers()
  fetchApi
    .mockResolvedValueOnce(receivingMoment([1, 2, 3]))
    .mockResolvedValueOnce(authorize('first'))
    .mockResolvedValueOnce(authorize('second'))
    .mockResolvedValueOnce(receivingMoment([2, 3]))
    .mockResolvedValueOnce(receivingMoment([3]))
    .mockResolvedValueOnce(authorize('third'))
    .mockResolvedValueOnce(validating())
  const onConfirmed = vi.fn()
  const { result } = renderHook(() => usePhotoSubmission('event', onConfirmed))

  await act(async () => result.current.send(momentDraft))
  await act(async () => PhotoRequest.requests[0]!.finish(200))
  await act(async () => PhotoRequest.requests[1]!.onerror?.())

  expect(result.current.view).toEqual({ kind: 'interrupted', canRetry: true, pendingPositions: [2, 3] })

  await act(async () => result.current.retry())

  const resumed = PhotoRequest.requests[2]!
  expect(resumed.send).toHaveBeenCalledWith(momentFiles[2])
  expect(result.current.view).toEqual({ kind: 'transferring', loaded: 10, total: 13, completionDeadlineAt: deadline })

  await act(async () => resumed.finish(200))

  expect(result.current.view).toEqual({ kind: 'validating' })
  expect(onConfirmed).not.toHaveBeenCalled()
  expect(PhotoRequest.requests).toHaveLength(3)
  expect(photoChecksum).toHaveBeenCalledTimes(3)
  const { url, uploads } = expectMomentAttempt()
  expect(fetchApi.mock.calls.map(([path]) => path)).toEqual([
    api, uploads[0], uploads[1], url, url, uploads[2], url + '/completion',
  ])
})

it.each([
  { state: 'rejected', code: 'photo-invalid', problemPositions: [2], kind: 'error' },
  { state: 'expired', code: 'submission-deadline-exceeded', problemPositions: [2, 3], kind: 'expired' },
])('preserva as posições afetadas no estado terminal $state', async ({ state, code, problemPositions, kind }) => {
  fetchApi
    .mockResolvedValueOnce(receivingMoment([2, 3]))
    .mockResolvedValueOnce(authorize('second'))
    .mockResolvedValueOnce(Response.json({ state, code, problemPositions }))
  const onConfirmed = vi.fn()
  const { result } = renderHook(() => usePhotoSubmission('event', onConfirmed))

  await act(async () => result.current.send(momentDraft))
  await act(async () => PhotoRequest.requests[0]!.onerror?.())

  expect(result.current.view).toMatchObject({ kind, problemPositions })
  if (state === 'rejected') {
    expect(result.current.view).toMatchObject({
      code: 'PHOTO_REJECTED',
      message: 'O conjunto não foi enviado. Confira os arquivos indicados.',
    })
  }
  await act(async () => result.current.retry())

  expect(onConfirmed).not.toHaveBeenCalled()
  expect(PhotoRequest.requests).toHaveLength(1)
  const { url, uploads } = expectMomentAttempt()
  expect(fetchApi.mock.calls.map(([path]) => path)).toEqual([api, uploads[1], url])
})

it.each([[0], [4], [1, 1]])('não autoriza uploads com posições pendentes inválidas: %j', async (...positions) => {
  fetchApi
    .mockResolvedValueOnce(receivingMoment(positions))
    .mockResolvedValueOnce(receivingMoment(positions))
  const { result } = renderHook(() => usePhotoSubmission('event', vi.fn()))

  await act(async () => result.current.send(momentDraft))

  expect(result.current.view.kind).toBe('interrupted')
  expect(PhotoRequest.requests).toHaveLength(0)
  const { url } = expectMomentAttempt()
  expect(fetchApi.mock.calls.map(([path]) => path)).toEqual([api, url])
})

it('retoma um PUT aceito pelo transporte quando o servidor ainda não tem o recibo da posição', async () => {
  vi.useFakeTimers()
  fetchApi
    .mockResolvedValueOnce(receivingMoment([2]))
    .mockResolvedValueOnce(authorize('second-first-put'))
    .mockResolvedValueOnce(receivingMoment([2]))
    .mockResolvedValueOnce(receivingMoment([2]))
    .mockResolvedValueOnce(authorize('second-renewed-put'))
    .mockResolvedValueOnce(validating())
  const onConfirmed = vi.fn()
  const { result } = renderHook(() => usePhotoSubmission('event', onConfirmed))

  await act(async () => result.current.send(momentDraft))
  const first = PhotoRequest.requests[0]!
  expect(first.send).toHaveBeenCalledWith(momentFiles[1])
  await act(async () => first.finish(200))

  expect(result.current.view).toEqual({ kind: 'awaiting-receipt', canRetry: true, pendingPositions: [2] })
  expect(onConfirmed).not.toHaveBeenCalled()

  await act(async () => result.current.retry())

  const resumed = PhotoRequest.requests[1]!
  expect(resumed.send).toHaveBeenCalledWith(momentFiles[1])
  act(() => resumed.upload.onprogress?.(new ProgressEvent('progress', { loaded: 3, total: momentFiles[1]!.size })))
  expect(result.current.view).toEqual({ kind: 'transferring', loaded: 10, total: 13, completionDeadlineAt: deadline })

  await act(async () => resumed.finish(200))

  expect(result.current.view).toEqual({ kind: 'validating' })
  expect(onConfirmed).not.toHaveBeenCalled()
  expect(PhotoRequest.requests).toHaveLength(2)
  const { url, uploads } = expectMomentAttempt()
  expect(fetchApi.mock.calls.map(([path]) => path)).toEqual([
    api, uploads[1], url + '/completion', url, uploads[1], url + '/completion',
  ])
})
