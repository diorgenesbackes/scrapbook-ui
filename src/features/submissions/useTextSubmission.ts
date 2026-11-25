import { useCallback, useEffect, useRef, useState } from 'react'
import {
  newSubmissionAttempt, readSubmission, submitText, type AttemptResult, type SubmissionAttempt, type TextSubmission,
} from './submissionService'

type View =
  | { kind: 'idle' | 'sending' | 'checking' | 'unknown' }
  | Extract<AttemptResult, { kind: 'confirmed' | 'error' }>

export function useTextSubmission(eventCode: string, onConfirmed: () => void) {
  const [view, setView] = useState<View>({ kind: 'idle' })
  const attempt = useRef<SubmissionAttempt | null>(null)
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

  useEffect(() => interrupt, [interrupt])

  const run = useCallback(async (current: SubmissionAttempt, mode: 'send' | 'retry' | 'poll') => {
    if (request.current) return
    const controller = new AbortController()
    request.current = controller
    const { signal } = controller
    try {
      if (mode !== 'poll') setView({ kind: mode === 'retry' ? 'checking' : 'sending' })
      let result = mode === 'send' ? await submitText(eventCode, current, signal) : await readSubmission(eventCode, current, signal)
      if (signal.aborted) return
      if (mode === 'retry' && result.kind === 'missing') {
        setView({ kind: 'sending' })
        result = await submitText(eventCode, current, signal)
      } else if (mode === 'send' && (result.kind === 'unknown' || result.kind === 'missing')) {
        setView({ kind: 'checking' })
        result = await readSubmission(eventCode, current, signal)
      }
      if (signal.aborted) return

      if (result.kind === 'confirmed' || result.kind === 'error') {
        attempt.current = null
        setView(result)
        if (result.kind === 'confirmed') onConfirmed()
      } else {
        setView(currentView => currentView.kind === 'unknown' ? currentView : { kind: 'unknown' })
      }
    } finally {
      if (request.current === controller) request.current = null
    }
  }, [eventCode, onConfirmed])

  useEffect(() => {
    if (view.kind !== 'unknown') return
    const timer = window.setInterval(() => {
      if (attempt.current) void run(attempt.current, 'poll')
    }, 5000)
    return () => window.clearInterval(timer)
  }, [view.kind, run])

  function send(draft: TextSubmission) {
    if (attempt.current || request.current) return
    if (!globalThis.crypto?.randomUUID) {
      setView({ kind: 'error', code: '', message: 'O envio precisa de uma conexão segura.' })
      return
    }
    const current = newSubmissionAttempt(draft)
    attempt.current = current
    void run(current, 'send')
  }

  function retry() {
    if (attempt.current) void run(attempt.current, 'retry')
  }

  return { view, send, retry, reset }
}
