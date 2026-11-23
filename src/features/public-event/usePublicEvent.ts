import { useEffect, useState } from 'react'
import { getPublicEvent, type PublicEvent, type SubmissionState } from './publicEventService'

const refreshInterval = 300_000
const transitionJitter = 2_000

type PublicEventView =
  | { kind: 'loading' | 'unavailable' }
  | { kind: 'failed'; canRetry: boolean; correlationId: string | null }
  | { kind: 'ready'; event: PublicEvent; state: SubmissionState }

export function usePublicEvent(code: string | undefined) {
  const [view, setView] = useState<PublicEventView>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!code) return
    const eventCode = code
    let request: AbortController | undefined
    let timer: number | undefined
    let closingTimer: number | undefined
    let retryAt = 0

    function stop() {
      request?.abort()
      window.clearTimeout(timer)
      window.clearTimeout(closingTimer)
    }

    function waitForRetry() {
      const remaining = retryAt - performance.now()
      if (remaining > 0) {
        timer = window.setTimeout(waitForRetry, Math.min(remaining, refreshInterval))
      } else {
        setView(current => current.kind === 'failed' ? { ...current, canRetry: true } : current)
      }
    }

    function guardClosing(event: PublicEvent, deadline: number) {
      const remaining = deadline - performance.now()
      if (remaining <= 0) {
        setView({ kind: 'ready', event, state: 'closed' })
      } else {
        closingTimer = window.setTimeout(() => guardClosing(event, deadline), Math.min(remaining, refreshInterval))
      }
    }

    function schedule(event: PublicEvent, requestedAt: number) {
      const { state, nextTransitionAt } = event.submissionWindow
      if (nextTransitionAt === null) {
        timer = window.setTimeout(() => void refresh(false), refreshInterval)
        return
      }

      const anchor = state === 'open' ? requestedAt : performance.now()
      const remaining = Math.max(0, nextTransitionAt - event.serverTime - (performance.now() - anchor))
      setView({ kind: 'ready', event, state: state === 'open' && remaining === 0 ? 'closed' : state })
      if (state === 'open' && remaining > 0) guardClosing(event, anchor + nextTransitionAt - event.serverTime)
      if (remaining > refreshInterval) {
        timer = window.setTimeout(() => void refresh(false), refreshInterval)
        return
      }

      timer = window.setTimeout(() => {
        timer = window.setTimeout(() => void refresh(false), Math.random() * transitionJitter)
      }, remaining)
    }

    async function refresh(clearView: boolean) {
      request?.abort()
      window.clearTimeout(timer)
      if (clearView) window.clearTimeout(closingTimer)
      if (document.hidden) return
      if (retryAt > performance.now()) {
        waitForRetry()
        return
      }

      if (clearView) setView({ kind: 'loading' })
      const active = new AbortController()
      request = active
      const requestedAt = performance.now()
      const result = await getPublicEvent(eventCode, active.signal)
      if (active.signal.aborted || result.kind === 'cancelled') return
      window.clearTimeout(closingTimer)

      if (result.kind === 'ready') {
        const { event } = result
        if (event.submissionWindow.nextTransitionAt === null) setView({ kind: 'ready', event, state: 'closed' })
        schedule(event, requestedAt)
      } else if (result.kind === 'unavailable') {
        setView(result)
      } else {
        retryAt = performance.now() + result.retryAfterMs
        setView({ kind: 'failed', canRetry: result.retryAfterMs === 0, correlationId: result.correlationId })
        if (result.retryAfterMs > 0) waitForRetry()
      }
    }

    function resume() {
      void refresh(true)
    }

    function restore(event: PageTransitionEvent) {
      if (event.persisted) resume()
    }

    document.addEventListener('visibilitychange', resume)
    window.addEventListener('pagehide', stop)
    window.addEventListener('pageshow', restore)
    void refresh(true)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('pagehide', stop)
      window.removeEventListener('pageshow', restore)
    }
  }, [code, attempt])

  return { view: code ? view : { kind: 'unavailable' } as const, retry: () => setAttempt(value => value + 1) }
}
