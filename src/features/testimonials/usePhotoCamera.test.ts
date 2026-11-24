import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { SelectedPhoto } from './photoFiles'
import { usePhotoCamera } from './usePhotoCamera'

const jpeg = new Blob([new Uint8Array([255, 216, 255])], { type: 'image/jpeg' })

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(settle => { resolve = settle })
  return { promise, resolve }
}

function fakeTrack() {
  const track = Object.assign(new EventTarget(), { readyState: 'live', stop: vi.fn() })
  track.stop.mockImplementation(() => { track.readyState = 'ended' })
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream
  return { stream, track }
}

function cameraHook() {
  const { stream, track } = fakeTrack()
  const request = vi.fn<() => Promise<MediaStream>>().mockResolvedValue(stream)
  const camera = { getUserMedia: request }
  vi.stubGlobal('navigator', { mediaDevices: camera })
  const onFile = vi.fn<(files: readonly File[], replacement?: SelectedPhoto) => Promise<void>>().mockResolvedValue()
  const hook = renderHook(({ enabled }) => usePhotoCamera(enabled, onFile), { initialProps: { enabled: true } })
  const video = document.createElement('video')
  Object.defineProperties(video, { videoWidth: { value: 3840 }, videoHeight: { value: 2160 } })
  vi.spyOn(video, 'play').mockResolvedValue()
  hook.result.current.video.current = video
  return { ...hook, camera, request, onFile, stream, track, video }
}

function mockEncoding(result: Blob | null) {
  const draw = vi.fn()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: draw } as unknown as CanvasRenderingContext2D)
  const encode = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(result))
  return { draw, encode }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('só pede vídeo após a ação explícita e aguarda a primeira imagem', async () => {
  const { result, request, track, video, stream, unmount } = cameraHook()
  expect(request).not.toHaveBeenCalled()
  await act(async () => { await result.current.start() })
  expect(request).toHaveBeenCalledWith({ audio: false, video: expect.objectContaining({ facingMode: { ideal: 'environment' } }) })
  expect(result.current.view).toEqual({ kind: 'live', stream, ready: false })
  expect(video.srcObject).toBe(stream)
  act(() => { video.dispatchEvent(new Event('loadeddata')) })
  expect(result.current.view).toEqual({ kind: 'live', stream, ready: true })
  unmount()
  expect(track.stop).toHaveBeenCalledOnce()
  expect(video.srcObject).toBeNull()
})

it('mostra recuperação quando o acesso é negado e não altera a seleção', async () => {
  const { result, request, onFile } = cameraHook()
  request.mockRejectedValueOnce(new DOMException('', 'NotAllowedError'))
  await act(async () => { await result.current.start() })
  expect(result.current.view).toEqual({ kind: 'failed', failure: 'unavailable' })
  expect(onFile).not.toHaveBeenCalled()
  act(() => { result.current.cancel() })
  expect(result.current.view.kind).toBe('idle')
})

it('encerra a trilha de um pedido que termina depois do cancelamento', async () => {
  const { result, request, track, stream, onFile } = cameraHook()
  const pending = deferred<MediaStream>()
  request.mockReturnValueOnce(pending.promise)
  act(() => { void result.current.start() })
  expect(result.current.view.kind).toBe('requesting')
  act(() => { result.current.cancel() })
  await act(async () => { pending.resolve(stream) })
  expect(track.stop).toHaveBeenCalledOnce()
  expect(result.current.view.kind).toBe('idle')
  expect(onFile).not.toHaveBeenCalled()
})

it('captura uma foto JPEG, encerra a trilha e reutiliza a posição ao refazer', async () => {
  const { result, video, track, onFile } = cameraHook()
  const { draw, encode } = mockEncoding(jpeg)
  const replacement: SelectedPhoto = { id: 7, file: new File([jpeg], 'existente.jpg'), url: 'blob:photo', format: 'jpeg', sizeBytes: jpeg.size }
  await act(async () => { await result.current.start(replacement) })
  act(() => { video.dispatchEvent(new Event('playing')) })
  onFile.mockImplementation(async () => { expect(track.readyState).toBe('ended') })
  await act(async () => { await result.current.capture() })
  expect(draw).toHaveBeenCalledWith(video, 0, 0, 1920, 1080)
  expect(encode).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.9)
  expect(onFile).toHaveBeenCalledWith([expect.objectContaining({ name: 'Foto da câmera.jpg', type: 'image/jpeg' })], replacement)
  expect(result.current.view.kind).toBe('idle')
  expect(video.srcObject).toBeNull()
})

it('encerra a câmera após falha na foto e permite tentar novamente', async () => {
  const { result, request, video, track, onFile } = cameraHook()
  mockEncoding(null)
  await act(async () => { await result.current.start() })
  act(() => { video.dispatchEvent(new Event('loadeddata')) })
  await act(async () => { await result.current.capture() })
  expect(track.stop).toHaveBeenCalledOnce()
  expect(result.current.view).toEqual({ kind: 'failed', failure: 'preview' })
  expect(onFile).not.toHaveBeenCalled()
  const retry = fakeTrack()
  request.mockResolvedValueOnce(retry.stream)
  await act(async () => { await result.current.start() })
  expect(result.current.view.kind).toBe('live')
})

it('cancela o JPEG pendente quando a edição é interrompida', async () => {
  const { result, video, track, onFile, rerender } = cameraHook()
  const { encode } = mockEncoding(jpeg)
  const pending = deferred<Blob>()
  encode.mockImplementation(callback => { void pending.promise.then(callback) })
  await act(async () => { await result.current.start() })
  act(() => { video.dispatchEvent(new Event('loadeddata')) })
  act(() => { void result.current.capture() })
  expect(track.stop).toHaveBeenCalledOnce()
  expect(result.current.view.kind).toBe('capturing')
  rerender({ enabled: false })
  await act(async () => { pending.resolve(jpeg) })
  expect(onFile).not.toHaveBeenCalled()
  expect(result.current.view.kind).toBe('idle')
})

it('encerra a câmera ao fechar a janela de contribuição ou sair da página', async () => {
  const { result, request, video, track, rerender } = cameraHook()
  await act(async () => { await result.current.start() })
  rerender({ enabled: false })
  expect(track.stop).toHaveBeenCalledOnce()
  expect(video.srcObject).toBeNull()
  await act(async () => { await result.current.start() })
  expect(request).toHaveBeenCalledOnce()

  const retry = fakeTrack()
  request.mockResolvedValueOnce(retry.stream)
  rerender({ enabled: true })
  await act(async () => { await result.current.start() })
  act(() => { window.dispatchEvent(new Event('pagehide')) })
  expect(retry.track.stop).toHaveBeenCalledOnce()
  expect(video.srcObject).toBeNull()
  expect(result.current.view.kind).toBe('idle')
})

it('permite recuperar quando o navegador encerra a trilha ou não entrega prévia', async () => {
  vi.useFakeTimers()
  const { result, request, track, video } = cameraHook()
  await act(async () => { await result.current.start() })
  act(() => { track.dispatchEvent(new Event('ended')) })
  expect(result.current.view).toEqual({ kind: 'failed', failure: 'preview' })
  expect(video.srcObject).toBeNull()
  const retry = fakeTrack()
  request.mockResolvedValueOnce(retry.stream)
  await act(async () => { await result.current.start() })
  act(() => { vi.advanceTimersByTime(12_000) })
  expect(result.current.view).toEqual({ kind: 'failed', failure: 'preview' })
  expect(retry.track.stop).toHaveBeenCalledOnce()
})
