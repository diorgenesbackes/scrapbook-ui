import type { ContributionCategory } from './guestContribution'
import { mediaLimits, type MediaKind } from './mediaFiles'

const formats = {
  video: [
    { mime: 'video/mp4;codecs=avc1,mp4a.40.2', extension: 'mp4' },
    { mime: 'video/webm;codecs=vp8,opus', extension: 'webm' },
  ],
  audio: [
    { mime: 'audio/mp4;codecs=mp4a.40.2', extension: 'm4a' },
    { mime: 'audio/ogg;codecs=opus', extension: 'ogg' },
    { mime: 'audio/webm;codecs=opus', extension: 'webm' },
  ],
} as const

type RecordingFormat = (typeof formats)[MediaKind][number]
export type RecordingFailure = 'unsupported' | 'permission' | 'interrupted' | 'size'

export function recordingFormat(kind: MediaKind) {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return undefined
  const player = document.createElement(kind)
  return formats[kind].find(format => MediaRecorder.isTypeSupported(format.mime) && !!player.canPlayType(format.mime))
}

export function releaseRecordingDevices(stream: MediaStream) {
  stream.getTracks().forEach(track => {
    if (track.readyState !== 'ended') track.stop()
  })
}

type RecordingEvents = {
  onTick: (seconds: number) => void
  onFinishing: () => void
  onFile: (file: File) => void
  onFailure: (failure: RecordingFailure) => void
}

export function recordMedia(stream: MediaStream, format: RecordingFormat, category: ContributionCategory, kind: MediaKind, events: RecordingEvents) {
  const limits = mediaLimits(category, kind)
  const tracks = stream.getTracks()
  const recorder = new MediaRecorder(stream, {
    mimeType: format.mime,
    audioBitsPerSecond: 96_000,
    ...(kind === 'video' ? { videoBitsPerSecond: 2_500_000 } : {}),
  })
  const listeners = new AbortController()
  const chunks: Blob[] = []
  let bytes = 0
  let state: 'recording' | 'finishing' | 'closed' = 'recording'
  let ticker: number | undefined
  let deadlineTimer: number | undefined
  let finalizationTimer: number | undefined

  function clearClock() {
    window.clearInterval(ticker)
    window.clearTimeout(deadlineTimer)
  }

  function cancel() {
    if (state === 'closed') return
    state = 'closed'
    listeners.abort()
    clearClock()
    window.clearTimeout(finalizationTimer)
    releaseRecordingDevices(stream)
    chunks.length = 0
    if (recorder.state !== 'inactive') {
      try { recorder.stop() } catch { return }
    }
  }

  function fail(failure: RecordingFailure) {
    cancel()
    events.onFailure(failure)
  }

  function stop() {
    if (state !== 'recording') return
    if (tracks.some(track => track.readyState === 'ended')) {
      fail('interrupted')
      return
    }
    state = 'finishing'
    clearClock()
    events.onFinishing()
    finalizationTimer = window.setTimeout(() => fail('interrupted'), 10_000)
    try {
      recorder.stop()
      releaseRecordingDevices(stream)
    } catch {
      fail('interrupted')
    }
  }

  const options = { signal: listeners.signal }
  for (const track of tracks) {
    track.addEventListener('ended', () => {
      if (state === 'recording') fail('interrupted')
    }, options)
  }
  recorder.addEventListener('error', () => fail('interrupted'), options)
  recorder.addEventListener('dataavailable', event => {
    if (!event.data.size) return
    bytes += event.data.size
    if (bytes > limits.bytes) fail('size')
    else chunks.push(event.data)
  }, options)
  recorder.addEventListener('stop', () => {
    if (state !== 'finishing') { fail('interrupted'); return }
    const mime = format.mime.slice(0, format.mime.indexOf(';'))
    const name = (kind === 'video' ? 'Vídeo gravado.' : 'Áudio gravado.') + format.extension
    const file = new File(chunks, name, { type: mime })
    cancel()
    events.onFile(file)
  }, options)

  try {
    const deadline = performance.now() + limits.seconds * 1000
    recorder.start(1000)
    deadlineTimer = window.setTimeout(stop, Math.max(0, deadline - performance.now()))
    ticker = window.setInterval(() => {
      if (tracks.some(track => track.readyState === 'ended')) fail('interrupted')
      else events.onTick(Math.max(0, Math.ceil((deadline - performance.now()) / 1000)))
    }, 250)
  } catch (error) {
    cancel()
    throw error
  }

  return { stop, cancel }
}
