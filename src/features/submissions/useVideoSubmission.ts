import { useCallback, useEffect, useRef, useState } from 'react'
import { newSubmissionAttempt, type SubmissionAttempt, type SubmissionIdentificationData } from './submissionService'
import { videoChecksum } from './videoChecksum'
import {
  completeVideoSubmission, readVideoSubmission, readVideoUpload, submitVideo, videoRejectedCode, videoSubmissionDisabledCode,
  type VideoStatus, type VideoSubmission,
} from './videoSubmissionService'
import { uploadVideo } from './videoUpload'

type VideoDraft = {
  category: VideoSubmission['category']
  file: File
  declaredMediaType: string
  caption: string | null
  identification: SubmissionIdentificationData
}

export type VideoSubmissionView =
  | { kind: 'idle' | 'preparing' | 'checking' | 'validating' | 'reconciling' | 'expired' }
  | { kind: 'transferring'; loaded: number; total: number; completionDeadlineAt: string }
  | { kind: 'interrupted' | 'paused' | 'awaiting-receipt'; canRetry: boolean }
  | { kind: 'error'; code: string; message: string }
  | { kind: 'confirmed'; confirmedAt: string }

type PendingVideo = {
  submission: SubmissionAttempt<VideoSubmission>
  file: File
  stage: 'admission' | 'transfer' | 'completion' | 'validation' | 'reconciliation'
  retryAt: number
  paused: boolean
}

export function useVideoSubmission(eventCode: string, onConfirmed: () => void) {
  const [view, setView] = useState<VideoSubmissionView>({ kind: 'idle' })
  const attempt = useRef<PendingVideo | null>(null)
  const request = useRef<AbortController | null>(null)

  const reset = useCallback(() => {
    request.current?.abort()
    request.current = null
    attempt.current = null
    setView({ kind: 'idle' })
  }, [])

  useEffect(() => () => {
    request.current?.abort()
    request.current = null
    attempt.current = null
  }, [eventCode])

  const execute = useCallback(async (operation: (signal: AbortSignal) => Promise<void>) => {
    if (request.current) return
    const controller = new AbortController()
    request.current = controller
    try {
      await operation(controller.signal)
    } finally {
      if (request.current === controller) request.current = null
    }
  }, [])

  const run = useCallback(async (current: PendingVideo, mode: 'send' | 'retry' | 'poll', signal: AbortSignal) => {
    if (performance.now() < current.retryAt) return
    const { submission, file } = current
    const read = () => readVideoSubmission(eventCode, submission, signal)
    const submit = () => submitVideo(eventCode, submission, signal)

    function wait() {
      if (signal.aborted) return
      if (current.stage === 'validation') setView({ kind: 'validating' })
      else if (current.stage === 'reconciliation') setView({ kind: 'reconciling' })
      else {
        const kind = current.paused ? 'paused' : current.stage === 'completion' ? 'awaiting-receipt' : 'interrupted'
        setView({ kind, canRetry: performance.now() >= current.retryAt })
      }
    }

    function accept(status: VideoStatus) {
      if (signal.aborted || status.kind === 'cancelled') return false
      switch (status.kind) {
        case 'receiving':
          if (current.stage === 'admission') current.stage = 'transfer'
          return true
        case 'validating':
          current.stage = 'validation'
          break
        case 'reconciling':
          current.stage = 'reconciliation'
          break
        case 'unknown':
          current.retryAt = performance.now() + status.retryAfterMs
          break
        case 'error':
          if (status.code === videoRejectedCode || current.stage === 'admission') {
            attempt.current = null
            setView(status)
            return false
          }
          if (status.code === 'UPLOAD_COMPLETION_DEADLINE_EXCEEDED') current.stage = 'reconciliation'
          if (status.code === videoSubmissionDisabledCode) current.paused = true
          break
        case 'expired':
          attempt.current = null
          setView({ kind: 'expired' })
          return false
        case 'confirmed':
          attempt.current = null
          setView(status)
          onConfirmed()
          return false
      }
      wait()
      return false
    }

    if (mode !== 'poll' && current.stage !== 'validation' && current.stage !== 'reconciliation') setView({ kind: 'checking' })
    let status = mode === 'send' ? await submit() : await read()
    if (signal.aborted) return
    if (mode === 'send' && (status.kind === 'missing' || (status.kind === 'unknown' && !status.retryAfterMs))) {
      status = await read()
    } else if (mode === 'retry' && status.kind === 'missing' && current.stage === 'admission') {
      status = await submit()
    }
    if (!accept(status)) return

    if (mode === 'poll' || current.stage === 'validation' || current.stage === 'reconciliation') {
      wait()
      return
    }

    const singlePutTransferred = current.stage === 'completion' && !submission.draft.files[0].partSha256
    if (!singlePutTransferred) {
      const upload = await readVideoUpload(eventCode, submission, signal)
      if (signal.aborted) return
      if (upload.kind !== 'ready') {
        accept(upload)
        return
      }
      current.paused = false
      const result = await uploadVideo(eventCode, submission, file, upload, signal, loaded => {
        if (!signal.aborted) setView({ kind: 'transferring', loaded, total: file.size, completionDeadlineAt: upload.completionDeadlineAt })
      })
      if (signal.aborted || result.kind === 'cancelled') return
      if (result.kind === 'interrupted' || (result.kind === 'error' && result.code === 'UPLOAD_NOT_AVAILABLE')) {
        setView({ kind: 'checking' })
        if (accept(await read())) wait()
        return
      }
      if (result.kind !== 'transferred') {
        accept(result)
        return
      }
    }

    current.stage = 'completion'
    setView({ kind: 'validating' })
    status = await completeVideoSubmission(eventCode, submission, signal)
    if (signal.aborted) return
    if (status.kind === 'missing' || (status.kind === 'unknown' && !status.retryAfterMs)) status = await read()
    if (accept(status)) wait()
  }, [eventCode, onConfirmed])

  useEffect(() => {
    if (view.kind !== 'interrupted' && view.kind !== 'paused' && view.kind !== 'awaiting-receipt'
      && view.kind !== 'validating' && view.kind !== 'reconciling') return
    const timer = window.setInterval(() => {
      const current = attempt.current
      if (current) void execute(signal => run(current, 'poll', signal))
    }, 5_000)
    return () => window.clearInterval(timer)
  }, [execute, run, view.kind])

  function send(draft: VideoDraft) {
    if (attempt.current || request.current) return
    if (!globalThis.crypto?.randomUUID) {
      setView({ kind: 'error', code: '', message: 'O envio precisa de uma conexão segura.' })
      return
    }
    void execute(async signal => {
      setView({ kind: 'preparing' })
      const hashes = await videoChecksum(draft.file, signal)
      if (signal.aborted) return
      if (!hashes) {
        setView({ kind: 'error', code: '', message: 'Não foi possível preparar o vídeo. Tente novamente.' })
        return
      }
      const submission = newSubmissionAttempt<VideoSubmission>({
        category: draft.category,
        format: 'video',
        identification: draft.identification,
        ...(draft.caption === null ? {} : { caption: draft.caption }),
        files: [{
          fileKey: crypto.randomUUID(),
          position: 1,
          declaredMediaType: draft.declaredMediaType,
          sizeBytes: draft.file.size,
          sha256: hashes.sha256,
          ...(hashes.partSha256.length ? { partSha256: hashes.partSha256 } : {}),
        }],
      })
      const current: PendingVideo = { submission, file: draft.file, stage: 'admission', retryAt: 0, paused: false }
      attempt.current = current
      await run(current, 'send', signal)
    })
  }

  function retry() {
    const current = attempt.current
    if (current) void execute(signal => run(current, 'retry', signal))
  }

  return { view, send, retry, reset }
}
