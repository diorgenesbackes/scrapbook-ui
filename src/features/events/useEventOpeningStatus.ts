import { useEffect, useState } from 'react'
import { openEventOpeningChannel } from './eventOpeningUpdates'
import { getEventOpeningStatus, type OpeningStatusResult } from './eventService'

const pollMilliseconds = 15_000
const boundaryRetryMilliseconds = 250

type OpeningView =
  | { kind: 'loading' }
  | Exclude<OpeningStatusResult, { kind: 'ready' }>
  | { kind: 'open' }
  | { kind: 'closed'; opensOn: string; remaining: number }

export function useEventOpeningStatus(eventId: string) {
  const [view, setView] = useState<OpeningView>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let request: AbortController | undefined
    let refreshTimer: number | undefined
    let countdownTimer: number | undefined

    function stop() {
      request?.abort()
      window.clearTimeout(refreshTimer)
      window.clearInterval(countdownTimer)
    }

    function invalidate() {
      stop()
      setView({ kind: 'loading' })
    }

    async function refresh(clearView: boolean) {
      if (clearView || document.hidden) invalidate()
      else stop()
      if (document.hidden) return
      const active = new AbortController()
      request = active
      const result = await getEventOpeningStatus(eventId, active.signal)
      if (active.signal.aborted) return
      if (result.kind !== 'ready') {
        setView(result)
        return
      }

      const data = result.data
      if (data.contentState === 'open') {
        setView({ kind: 'open' })
        refreshTimer = window.setTimeout(() => void refresh(false), pollMilliseconds)
        return
      }

      const { opensOn, opensAt, serverTime } = data
      const receivedAt = performance.now()
      const duration = opensAt - serverTime
      function updateCountdown() {
        const remaining = Math.max(0, duration - (performance.now() - receivedAt))
        if (remaining === 0) {
          setView({ kind: 'loading' })
        } else {
          setView({ kind: 'closed', opensOn, remaining })
        }
      }

      updateCountdown()
      countdownTimer = window.setInterval(updateCountdown, 1_000)
      const delay = Math.min(pollMilliseconds, Math.max(boundaryRetryMilliseconds, duration))
      refreshTimer = window.setTimeout(() => void refresh(duration <= pollMilliseconds), delay)
    }

    function resume() {
      void refresh(true)
    }

    const channel = openEventOpeningChannel()
    if (channel) channel.onmessage = message => {
      if (message.data === eventId) void refresh(true)
    }
    function restore(event: PageTransitionEvent) {
      if (event.persisted) resume()
    }

    window.addEventListener('focus', resume)
    window.addEventListener('pageshow', restore)
    window.addEventListener('pagehide', invalidate)
    document.addEventListener('visibilitychange', resume)
    void refresh(true)

    return () => {
      stop()
      window.removeEventListener('focus', resume)
      window.removeEventListener('pageshow', restore)
      window.removeEventListener('pagehide', invalidate)
      document.removeEventListener('visibilitychange', resume)
      channel?.close()
    }
  }, [eventId, attempt])

  return { view, retry: () => setAttempt(current => current + 1) }
}
