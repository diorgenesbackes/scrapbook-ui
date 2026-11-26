import { useCallback, useEffect, useRef, useState } from 'react'
import { newSubmissionAttempt, type SubmissionAttempt, type SubmissionIdentificationData } from './submissionService'
import { submissionChecksum } from './submissionChecksum'
import { videoChecksum } from './videoChecksum'
import {
  completeMediaSubmission, maxAudioBytes, mediaSubmissionIssues, readMediaSubmission, readMediaUpload, submitMedia,
  type MediaStatus, type MediaSubmission, type MediaUploadFormat,
} from './mediaSubmissionService'
import { uploadMedia } from './mediaUpload'

type MediaDraft<Format extends MediaUploadFormat> = {
  category: MediaSubmission<Format>['category']
  file: File
  declaredMediaType: string
  caption: string | null
  identification: SubmissionIdentificationData
}

export type MediaSubmissionView =
  | { kind: 'idle' | 'preparing' | 'checking' | 'validating' | 'reconciling' | 'expired' }
  | { kind: 'transferring'; loaded: number; total: number; completionDeadlineAt: string }
  | { kind: 'interrupted' | 'paused' | 'awaiting-receipt'; canRetry: boolean }
  | { kind: 'error'; code: string; message: string }
  | { kind: 'confirmed'; confirmedAt: string }

type PendingMedia = {
  submission: SubmissionAttempt<MediaSubmission>
  file: File
  stage: 'admission' | 'transfer' | 'completion' | 'validation' | 'reconciliation'
  retryAt: number
  paused: boolean
}

export function useMediaSubmission<Format extends MediaUploadFormat>(eventCode: string, format: Format, onConfirmed: () => void) {
  const [view, setView] = useState<MediaSubmissionView>({ kind: 'idle' })
  const attempt = useRef<PendingMedia | null>(null)
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

  const run = useCallback(async (current: PendingMedia, mode: 'send' | 'retry' | 'poll', signal: AbortSignal) => {
    if (performance.now() < current.retryAt) return
    const { submission, file } = current
    const issues = mediaSubmissionIssues[submission.draft.format]
    const read = () => readMediaSubmission(eventCode, submission, signal)
    const submit = () => submitMedia(eventCode, submission, signal)

    function wait() {
      if (signal.aborted) return
      if (current.stage === 'validation') setView({ kind: 'validating' })
      else if (current.stage === 'reconciliation') setView({ kind: 'reconciling' })
      else {
        const kind = current.paused ? 'paused' : current.stage === 'completion' ? 'awaiting-receipt' : 'interrupted'
        setView({ kind, canRetry: performance.now() >= current.retryAt })
      }
    }

    function accept(status: MediaStatus) {
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
          if (status.code === issues.rejectedCode || current.stage === 'admission') {
            attempt.current = null
            setView(status)
            return false
          }
          if (status.code === 'UPLOAD_COMPLETION_DEADLINE_EXCEEDED') current.stage = 'reconciliation'
          if (status.code === issues.disabledCode) current.paused = true
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
      const upload = await readMediaUpload(eventCode, submission, signal)
      if (signal.aborted) return
      if (upload.kind !== 'ready') {
        accept(upload)
        return
      }
      current.paused = false
      const result = await uploadMedia(eventCode, submission, file, upload, signal, loaded => {
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
    status = await completeMediaSubmission(eventCode, submission, signal)
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

  function send(draft: MediaDraft<Format>) {
    if (attempt.current || request.current) return
    if (!globalThis.crypto?.randomUUID) {
      setView({ kind: 'error', code: '', message: 'O envio precisa de uma conexão segura.' })
      return
    }
    void execute(async signal => {
      setView({ kind: 'preparing' })
      const invalidAudioSize = format === 'audio' && (draft.file.size === 0 || draft.file.size > maxAudioBytes)
      const hashes = invalidAudioSize ? null : await (format === 'audio'
        ? submissionChecksum(draft.file, null, signal)
        : videoChecksum(draft.file, signal))
      if (signal.aborted) return
      if (!hashes) {
        setView({ kind: 'error', code: '', message: format === 'video'
          ? 'Não foi possível preparar o vídeo. Tente novamente.' : 'Não foi possível preparar o áudio. Tente novamente.' })
        return
      }
      const submission = newSubmissionAttempt<MediaSubmission<Format>>({
        category: draft.category,
        format,
        identification: draft.identification,
        ...(draft.caption === null ? {} : { caption: draft.caption }),
        files: [{
          fileKey: crypto.randomUUID(),
          position: 1,
          declaredMediaType: draft.declaredMediaType,
          sizeBytes: draft.file.size,
          sha256: hashes.sha256,
          ...(format === 'video' && hashes.partSha256.length ? { partSha256: hashes.partSha256 } : {}),
        }],
      })
      const current: PendingMedia = { submission, file: draft.file, stage: 'admission', retryAt: 0, paused: false }
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
