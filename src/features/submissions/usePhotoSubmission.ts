import { useCallback, useEffect, useRef, useState } from 'react'
import { photoChecksum } from './photoChecksum'
import {
  authorizePhotoUpload, completePhotoSubmission, photoSubmissionDisabledCode, readPhotoSubmission, submitPhoto,
  type PhotoCategory, type PhotoManifest, type PhotoStatus, type PhotoSubmission,
} from './photoSubmissionService'
import { uploadPhoto } from './photoUpload'
import { newSubmissionAttempt, type SubmissionAttempt, type SubmissionIdentificationData } from './submissionService'

type PhotoDraft = {
  category: PhotoCategory
  files: readonly { file: File; declaredMediaType: string }[]
  caption: string | null
  identification: SubmissionIdentificationData
}

export type PhotoSubmissionView =
  | { kind: 'idle' | 'preparing' | 'checking' | 'validating' | 'reconciling' }
  | { kind: 'transferring'; loaded: number; total: number; completionDeadlineAt: string | null }
  | { kind: 'interrupted' | 'paused'; canRetry: boolean; pendingPositions?: number[] }
  | Extract<PhotoStatus, { kind: 'error' | 'confirmed' | 'expired' }>

type PreparedPhoto = { file: File; manifest: PhotoManifest }
type PendingPhoto = {
  submission: SubmissionAttempt<PhotoSubmission>
  files: readonly PreparedPhoto[]
  total: number
  pendingPositions: Set<number>
  uploadedPositions: Set<number>
  stage: 'admission' | 'transfer' | 'paused' | 'completion' | 'validation' | 'reconciliation'
  completionDeadlineAt: string | null
  retryAt: number
}

export function usePhotoSubmission(eventCode: string, onConfirmed: () => void) {
  const [view, setView] = useState<PhotoSubmissionView>({ kind: 'idle' })
  const attempt = useRef<PendingPhoto | null>(null)
  const request = useRef<AbortController | null>(null)

  const interrupt = useCallback(() => {
    request.current?.abort()
    request.current = null
    attempt.current = null
  }, [])
  const reset = useCallback(() => {
    interrupt()
    setView({ kind: 'idle' })
  }, [interrupt])

  useEffect(() => interrupt, [eventCode, interrupt])

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

  const run = useCallback(async (current: PendingPhoto, mode: 'send' | 'retry' | 'poll', signal: AbortSignal) => {
    if (performance.now() < current.retryAt) return
    const { submission } = current
    const moment = submission.draft.category === 'moment'
    const read = () => readPhotoSubmission(eventCode, submission, signal)

    function interrupted(kind: 'interrupted' | 'paused') {
      setView({
        kind, canRetry: performance.now() >= current.retryAt,
        ...(moment ? { pendingPositions: [...current.pendingPositions] } : {}),
      })
    }

    function wait() {
      if (current.stage === 'reconciliation') setView({ kind: 'reconciling' })
      else if (current.stage === 'validation') setView({ kind: 'validating' })
      else interrupted(current.stage === 'paused' ? 'paused' : 'interrupted')
    }

    function accept(status: PhotoStatus): boolean {
      if (signal.aborted || status.kind === 'cancelled') return false
      switch (status.kind) {
        case 'receiving':
          if (current.stage === 'admission') current.stage = 'transfer'
          current.completionDeadlineAt = status.completionDeadlineAt ?? current.completionDeadlineAt
          current.pendingPositions = new Set(status.pendingPositions.filter(position => !current.uploadedPositions.has(position)))
          return true
        case 'validating':
          current.stage = 'validation'
          break
        case 'unknown':
          current.retryAt = performance.now() + status.retryAfterMs
          if (current.stage !== 'reconciliation' && current.stage !== 'paused') {
            interrupted('interrupted')
            return false
          }
          break
        case 'error':
          if (status.code === photoSubmissionDisabledCode && (current.stage === 'transfer' || current.stage === 'paused')) {
            current.stage = 'paused'
            break
          }
          if (status.code === 'UPLOAD_COMPLETION_DEADLINE_EXCEEDED' && current.stage !== 'admission') {
            current.stage = 'reconciliation'
            break
          }
          if (current.stage === 'admission' || status.code === 'PHOTO_REJECTED') {
            attempt.current = null
            setView(status)
            return false
          }
          break
        case 'expired':
          attempt.current = null
          setView(status)
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

    async function put({ file, manifest }: PreparedPhoto) {
      const authorization = await authorizePhotoUpload(eventCode, submission, manifest, signal)
      if (signal.aborted) return 'cancelled'
      if (authorization.kind === 'error' && authorization.code === 'UPLOAD_NOT_AVAILABLE') return 'interrupted'
      if (authorization.kind !== 'authorized') {
        accept(authorization)
        return 'cancelled'
      }
      current.stage = 'transfer'
      const received = current.files.reduce((bytes, photo) =>
        bytes + (current.pendingPositions.has(photo.manifest.position) ? 0 : photo.file.size), 0)
      const progress = (loaded: number) => {
        if (!signal.aborted) setView({
          kind: 'transferring', loaded: received + loaded, total: current.total, completionDeadlineAt: current.completionDeadlineAt,
        })
      }
      progress(0)
      return uploadPhoto(authorization, file, signal, progress)
    }

    async function transfer() {
      for (const photo of current.files) {
        const { position } = photo.manifest
        if (!current.pendingPositions.has(position)) continue
        let result = await put(photo)
        if (signal.aborted || result === 'cancelled') return false
        if (result === 'authorization-failed') {
          setView({ kind: 'checking' })
          if (!accept(await read())) return false
          if (!current.pendingPositions.has(position)) continue
          result = await put(photo)
        }
        if (signal.aborted || result === 'cancelled') return false
        if (result === 'transferred') {
          current.uploadedPositions.add(position)
          current.pendingPositions.delete(position)
          continue
        }
        setView({ kind: 'checking' })
        if (!accept(await read())) return false
        if (!current.pendingPositions.has(position)) continue
        wait()
        return false
      }
      return true
    }

    if (mode !== 'poll' && current.stage !== 'validation' && current.stage !== 'reconciliation') setView({ kind: 'checking' })
    let status = mode === 'send' ? await submitPhoto(eventCode, submission, signal) : await read()
    if (signal.aborted) return
    if (mode === 'send' && (status.kind === 'missing' || (status.kind === 'unknown' && !status.retryAfterMs))) {
      status = await read()
    } else if (mode === 'retry' && status.kind === 'missing' && current.stage === 'admission') {
      status = await submitPhoto(eventCode, submission, signal)
    }
    if (!accept(status)) return

    if (mode === 'poll' || current.stage === 'validation' || current.stage === 'reconciliation') {
      if (current.stage !== 'reconciliation' && !current.pendingPositions.size) current.stage = 'validation'
      wait()
      return
    }

    if (current.stage === 'transfer' || current.stage === 'paused') {
      if (!await transfer() || signal.aborted) return
      current.stage = 'completion'
    }

    setView({ kind: 'validating' })
    status = await completePhotoSubmission(eventCode, submission, signal)
    if (signal.aborted) return
    if (status.kind === 'missing' || (status.kind === 'unknown' && !status.retryAfterMs)) {
      if (accept(await read())) wait()
    } else if (accept(status)) {
      current.stage = 'validation'
      wait()
    }
  }, [eventCode, onConfirmed])

  useEffect(() => {
    if (view.kind !== 'interrupted' && view.kind !== 'paused' && view.kind !== 'validating' && view.kind !== 'reconciling') return
    const timer = window.setInterval(() => {
      const current = attempt.current
      if (current) void execute(signal => run(current, 'poll', signal))
    }, 5_000)
    return () => window.clearInterval(timer)
  }, [execute, run, view.kind])

  function send(draft: PhotoDraft) {
    if (attempt.current || request.current) return
    if (!globalThis.crypto?.randomUUID) {
      setView({ kind: 'error', code: '', message: 'O envio precisa de uma conexão segura.' })
      return
    }
    void execute(async signal => {
      setView({ kind: 'preparing' })
      const files: PreparedPhoto[] = []
      for (const { file, declaredMediaType } of draft.files) {
        const position = files.length + 1
        const sha256 = await photoChecksum(file, signal)
        if (signal.aborted) return
        if (!sha256) {
          const photo = draft.category === 'moment' ? 'a foto ' + position : 'a foto'
          setView({ kind: 'error', code: '', message: 'Não foi possível preparar ' + photo + '. Tente novamente.' })
          return
        }
        files.push({
          file, manifest: { fileKey: crypto.randomUUID(), position, declaredMediaType, sizeBytes: file.size, sha256 },
        })
      }
      const submission = newSubmissionAttempt<PhotoSubmission>({
        category: draft.category,
        format: 'photo',
        identification: draft.identification,
        ...(draft.caption === null ? {} : { caption: draft.caption }),
        files: files.map(({ manifest }) => manifest),
      })
      const current: PendingPhoto = {
        submission, files, total: files.reduce((bytes, { file }) => bytes + file.size, 0),
        pendingPositions: new Set(submission.draft.files.map(({ position }) => position)),
        uploadedPositions: new Set(),
        stage: 'admission', completionDeadlineAt: null, retryAt: 0,
      }
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
