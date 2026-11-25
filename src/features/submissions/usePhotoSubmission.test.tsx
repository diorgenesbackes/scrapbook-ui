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
  file, declaredMediaType: file.type, caption: 'Foto sintética',
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
  const upload = url + '/files/' + payload.files[0].fileKey + '/upload-authorizations'
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
