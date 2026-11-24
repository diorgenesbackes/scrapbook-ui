import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { recordingFormat, recordMedia } from './mediaRecording'
import { useMediaRecording } from './useMediaRecording'

class TestRecorder extends EventTarget {
  static latest: TestRecorder
  static isTypeSupported = vi.fn<(type: string) => boolean>()
  state: RecordingState = 'inactive'
  start = vi.fn(() => { this.state = 'recording' })
  stop = vi.fn(() => { this.state = 'inactive' })

  constructor() {
    super()
    TestRecorder.latest = this
  }

  data(blob: Blob) {
    this.dispatchEvent(Object.assign(new Event('dataavailable'), { data: blob }))
  }
}

function device() {
  const track = Object.assign(new EventTarget(), { readyState: 'live', stop: vi.fn() })
  track.stop.mockImplementation(() => { track.readyState = 'ended' })
  const stream = { getTracks: () => [track] } as unknown as MediaStream
  return { stream, track }
}

function pendingDevice() {
  let resolve!: (stream: MediaStream) => void
  const promise = new Promise<MediaStream>(settle => { resolve = settle })
  return { promise, resolve }
}

function events() {
  return { onFile: vi.fn(), onFailure: vi.fn(), onFinishing: vi.fn(), onTick: vi.fn() }
}

beforeEach(() => {
  vi.stubGlobal('MediaRecorder', TestRecorder)
  vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably')
  TestRecorder.isTypeSupported.mockReturnValue(true)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('prefere MP4 reproduzível e usa WebM ou Ogg quando necessário', () => {
  expect(recordingFormat('video')?.extension).toBe('mp4')
  expect(recordingFormat('audio')?.extension).toBe('m4a')
  vi.mocked(HTMLMediaElement.prototype.canPlayType).mockImplementation(mime => mime.includes('/mp4') ? '' : 'probably')
  expect(recordingFormat('video')?.extension).toBe('webm')
  expect(recordingFormat('audio')?.extension).toBe('ogg')
  TestRecorder.isTypeSupported.mockReturnValue(false)
  expect(recordingFormat('audio')).toBeUndefined()
})

it.each([['moment', 'video', 60], ['testimonial', 'video', 300], ['testimonial', 'audio', 300]] as const)(
  'encerra %s em %s no prazo de %s segundos e libera o dispositivo antes do arquivo',
  (category, kind, limit) => {
    vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    const { stream, track } = device()
    const callbacks = events()
    const session = recordMedia(stream, recordingFormat(kind)!, category, kind, callbacks)
    const recorder = TestRecorder.latest
    vi.advanceTimersByTime((limit - 1) * 1000)
    expect(callbacks.onTick).toHaveBeenLastCalledWith(1)
    expect(recorder.stop).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(recorder.stop).toHaveBeenCalledOnce()
    expect(track.stop).toHaveBeenCalledOnce()
    expect(callbacks.onFinishing).toHaveBeenCalledOnce()
    expect(callbacks.onFile).not.toHaveBeenCalled()
    recorder.data(new Blob(['dados']))
    recorder.dispatchEvent(new Event('stop'))
    expect(callbacks.onFile).toHaveBeenCalledWith(expect.objectContaining({ size: 5 }))
    expect(callbacks.onFailure).not.toHaveBeenCalled()
    session.stop()
    expect(recorder.stop).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  },
)

it('processa a saída vazia e libera a trilha na parada manual', () => {
  const { stream, track } = device()
  const callbacks = events()
  const session = recordMedia(stream, recordingFormat('audio')!, 'testimonial', 'audio', callbacks)
  session.stop()
  const recorder = TestRecorder.latest
  recorder.data(new Blob())
  recorder.dispatchEvent(new Event('stop'))
  expect(track.stop).toHaveBeenCalledOnce()
  expect(callbacks.onFile).toHaveBeenCalledWith(expect.objectContaining({ size: 0, type: 'audio/mp4' }))
})

it('interrompe ao superar o limite de bytes, antes de guardar o bloco', () => {
  const { stream, track } = device()
  const callbacks = events()
  recordMedia(stream, recordingFormat('audio')!, 'testimonial', 'audio', callbacks)
  const recorder = TestRecorder.latest
  const block = new Blob(['x'])
  Object.defineProperty(block, 'size', { value: 50_000_001 })
  recorder.data(block)
  recorder.dispatchEvent(new Event('stop'))
  expect(callbacks.onFailure).toHaveBeenCalledWith('size')
  expect(callbacks.onFile).not.toHaveBeenCalled()
  expect(track.stop).toHaveBeenCalledOnce()
})

it('descarta a saída quando uma trilha acaba ou o gravador falha', () => {
  for (const situation of ['ended', 'error']) {
    const { stream, track } = device()
    const callbacks = events()
    recordMedia(stream, recordingFormat('video')!, 'moment', 'video', callbacks)
    const recorder = TestRecorder.latest
    const emitter = situation === 'ended' ? track : recorder
    emitter.dispatchEvent(new Event(situation))
    recorder.dispatchEvent(new Event('stop'))
    expect(callbacks.onFile).not.toHaveBeenCalled()
    expect(callbacks.onFailure).toHaveBeenCalledWith('interrupted')
    expect(track.stop).toHaveBeenCalledOnce()
  }
})

it('detecta uma trilha finalizada mesmo sem receber o evento de encerramento', () => {
  vi.useFakeTimers()
  const { stream, track } = device()
  const callbacks = events()
  recordMedia(stream, recordingFormat('video')!, 'moment', 'video', callbacks)
  track.stop()
  vi.advanceTimersByTime(250)
  expect(callbacks.onFailure).toHaveBeenCalledWith('interrupted')
  expect(callbacks.onFile).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('libera timers e ignora blocos e parada após cancelamento', () => {
  vi.useFakeTimers()
  const { stream, track } = device()
  const callbacks = events()
  const session = recordMedia(stream, recordingFormat('video')!, 'moment', 'video', callbacks)
  session.cancel()
  const recorder = TestRecorder.latest
  recorder.data(new Blob(['dados']))
  recorder.dispatchEvent(new Event('stop'))
  expect(callbacks.onFile).not.toHaveBeenCalled()
  expect(callbacks.onFailure).not.toHaveBeenCalled()
  expect(track.stop).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})

it('recupera se o navegador não finalizar após a parada', () => {
  vi.useFakeTimers()
  const { stream, track } = device()
  const callbacks = events()
  const session = recordMedia(stream, recordingFormat('video')!, 'moment', 'video', callbacks)
  session.stop()
  vi.advanceTimersByTime(10_000)
  expect(callbacks.onFailure).toHaveBeenCalledWith('interrupted')
  expect(track.stop).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})

it('pede só microfone para áudio e oferece alternativa se a permissão for negada', async () => {
  const getUserMedia = vi.fn().mockRejectedValue(new DOMException('', 'NotAllowedError'))
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  const accept = vi.fn().mockResolvedValue(undefined)
  const { result } = renderHook(() => useMediaRecording('testimonial', accept))
  expect(getUserMedia).not.toHaveBeenCalled()
  await act(async () => { await result.current.start('audio') })
  expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false })
  expect(result.current.view).toEqual({ kind: 'failed', failure: 'permission' })
  expect(accept).not.toHaveBeenCalled()
})

it('não solicita dispositivo para formato incompatível ou áudio de momento', async () => {
  const getUserMedia = vi.fn()
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  TestRecorder.isTypeSupported.mockReturnValue(false)
  const accept = vi.fn().mockResolvedValue(undefined)
  const { result } = renderHook(() => useMediaRecording('moment', accept))
  await act(async () => { await result.current.start('audio') })
  expect(result.current.view.kind).toBe('idle')
  await act(async () => { await result.current.start('video') })
  expect(result.current.view).toEqual({ kind: 'failed', failure: 'unsupported' })
  expect(getUserMedia).not.toHaveBeenCalled()
})

it('descarta a permissão que chega depois de sair e encerra as trilhas', async () => {
  const { stream, track } = device()
  const pending = pendingDevice()
  const getUserMedia = vi.fn().mockReturnValue(pending.promise)
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  const accept = vi.fn().mockResolvedValue(undefined)
  const { result } = renderHook(() => useMediaRecording('testimonial', accept))
  act(() => { void result.current.start('video') })
  expect(result.current.view.kind).toBe('requesting')
  act(() => { window.dispatchEvent(new Event('pagehide')) })
  await act(async () => { pending.resolve(stream) })
  expect(result.current.view.kind).toBe('idle')
  expect(track.stop).toHaveBeenCalledOnce()
  expect(accept).not.toHaveBeenCalled()
})
