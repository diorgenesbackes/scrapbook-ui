import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ContributionCategory } from './guestContribution'
import { mediaLimits, type MediaKind } from './mediaFiles'
import { recordingFormat, recordMedia, releaseRecordingDevices, type RecordingFailure } from './mediaRecording'

type RecordingView =
  | { kind: 'idle' | 'requesting' | 'finishing' }
  | { kind: 'recording'; stream: MediaStream; seconds: number }
  | { kind: 'failed'; failure: RecordingFailure }
type Attempt = { controller: AbortController; session?: ReturnType<typeof recordMedia> }
type AcceptRecording = (file: File, kind: MediaKind, signal: AbortSignal) => Promise<void>

export function useMediaRecording(category: ContributionCategory, acceptRecording: AcceptRecording) {
  const [view, setView] = useState<RecordingView>({ kind: 'idle' })
  const attempt = useRef<Attempt | null>(null)
  const accept = useRef(acceptRecording)

  useLayoutEffect(() => { accept.current = acceptRecording }, [acceptRecording])

  const release = useCallback(() => {
    const current = attempt.current
    attempt.current = null
    current?.controller.abort()
    current?.session?.cancel()
  }, [])
  const cancel = useCallback(() => {
    release()
    setView({ kind: 'idle' })
  }, [release])

  useLayoutEffect(() => release, [release])
  useEffect(() => {
    window.addEventListener('pagehide', cancel)
    return () => window.removeEventListener('pagehide', cancel)
  }, [cancel])

  async function start(kind: MediaKind) {
    if (attempt.current || (category === 'moment' && kind === 'audio')) return
    const format = recordingFormat(kind)
    if (!format || !navigator.mediaDevices) {
      setView({ kind: 'failed', failure: 'unsupported' })
      return
    }
    const current: Attempt = { controller: new AbortController() }
    attempt.current = current
    setView({ kind: 'requesting' })

    function fail(failure: RecordingFailure) {
      if (attempt.current !== current) return
      release()
      setView({ kind: 'failed', failure })
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: kind === 'video' ? { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24 } } : false,
      })
    } catch {
      fail('permission')
      return
    }
    if (attempt.current !== current) {
      releaseRecordingDevices(stream)
      return
    }

    async function acceptFile(file: File) {
      try {
        await accept.current(file, kind, current.controller.signal)
        if (attempt.current === current) cancel()
      } catch {
        fail('interrupted')
      }
    }

    try {
      current.session = recordMedia(stream, format, category, kind, {
        onTick: seconds => setView(previous => previous.kind === 'recording' && previous.seconds !== seconds ? { ...previous, seconds } : previous),
        onFinishing: () => setView({ kind: 'finishing' }),
        onFile: file => { void acceptFile(file) },
        onFailure: fail,
      })
      setView({ kind: 'recording', stream, seconds: mediaLimits(category, kind).seconds })
    } catch {
      releaseRecordingDevices(stream)
      fail('unsupported')
    }
  }

  const active = view.kind === 'requesting' || view.kind === 'recording' || view.kind === 'finishing'
  return { view, active, start, stop: () => attempt.current?.session?.stop(), cancel }
}
