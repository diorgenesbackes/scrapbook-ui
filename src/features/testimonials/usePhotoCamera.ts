import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { SelectedPhoto } from './photoFiles'

type CameraFailure = 'unavailable' | 'preview'
type CameraView =
  | { kind: 'idle' | 'requesting' | 'capturing' }
  | { kind: 'live'; stream: MediaStream; ready: boolean }
  | { kind: 'failed'; failure: CameraFailure }
type CameraAttempt = { stream: MediaStream | null; replacement: SelectedPhoto | undefined }

function releaseCamera(attempt: CameraAttempt) {
  attempt.stream?.getTracks().forEach(track => track.stop())
  attempt.stream = null
}

function captureFrame(video: HTMLVideoElement) {
  const { videoWidth: width, videoHeight: height } = video
  if (!width || !height) throw new Error()
  const scale = Math.min(1, 1920 / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error()
  context.drawImage(video, 0, 0, canvas.width, canvas.height)
  return new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
}

export function usePhotoCamera(enabled: boolean, onFile: (files: readonly File[], replacement?: SelectedPhoto) => Promise<void>) {
  const [view, setView] = useState<CameraView>({ kind: 'idle' })
  const attempt = useRef<CameraAttempt | null>(null)
  const video = useRef<HTMLVideoElement>(null)

  const release = useCallback(() => {
    const current = attempt.current
    attempt.current = null
    if (current) releaseCamera(current)
  }, [])

  const cancel = useCallback(() => {
    release()
    setView({ kind: 'idle' })
  }, [release])

  const fail = useCallback((current: CameraAttempt, failure: CameraFailure) => {
    if (attempt.current !== current) return
    release()
    setView({ kind: 'failed', failure })
  }, [release])

  useLayoutEffect(() => release, [release])
  useLayoutEffect(() => {
    if (!enabled) cancel()
  }, [cancel, enabled])
  useEffect(() => {
    window.addEventListener('pagehide', cancel)
    return () => window.removeEventListener('pagehide', cancel)
  }, [cancel])

  const stream = view.kind === 'live' ? view.stream : null
  useLayoutEffect(() => {
    const element = video.current
    const current = attempt.current
    if (!element || !stream || !current || !enabled) return

    const tracks = stream.getVideoTracks()
    const onFailure = () => {
      if (current.stream === stream) fail(current, 'preview')
    }
    const timer = window.setTimeout(onFailure, 12_000)

    const onReady = () => {
      if (current.stream !== stream || !element.videoWidth || !element.videoHeight) return
      window.clearTimeout(timer)
      setView({ kind: 'live', stream, ready: true })
    }

    element.addEventListener('loadeddata', onReady)
    element.addEventListener('playing', onReady)
    element.addEventListener('error', onFailure)
    tracks.forEach(track => track.addEventListener('ended', onFailure))
    element.srcObject = stream
    if (tracks.every(track => track.readyState === 'ended')) onFailure()
    else void element.play().catch(onFailure)

    return () => {
      window.clearTimeout(timer)
      element.removeEventListener('loadeddata', onReady)
      element.removeEventListener('playing', onReady)
      element.removeEventListener('error', onFailure)
      tracks.forEach(track => track.removeEventListener('ended', onFailure))
      element.srcObject = null
    }
  }, [enabled, fail, stream])

  async function start(replacement?: SelectedPhoto) {
    if (!enabled || attempt.current) return
    const current: CameraAttempt = { stream: null, replacement }
    attempt.current = current
    setView({ kind: 'requesting' })
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
      if (attempt.current !== current) {
        acquired.getTracks().forEach(track => track.stop())
        return
      }
      current.stream = acquired
      setView({ kind: 'live', stream: acquired, ready: false })
    } catch {
      fail(current, 'unavailable')
    }
  }

  async function capture() {
    const current = attempt.current
    const element = video.current
    if (!current?.stream || !element || view.kind !== 'live' || !view.ready) return
    let file: File
    try {
      const encoding = captureFrame(element)
      releaseCamera(current)
      setView({ kind: 'capturing' })
      const blob = await encoding
      if (attempt.current !== current) return
      if (!blob || blob.type !== 'image/jpeg') {
        fail(current, 'preview')
        return
      }
      file = new File([blob], 'Foto da câmera.jpg', { type: blob.type })
    } catch {
      fail(current, 'preview')
      return
    }
    cancel()
    await onFile([file], current.replacement)
  }

  return { view, video, start, cancel, capture }
}
