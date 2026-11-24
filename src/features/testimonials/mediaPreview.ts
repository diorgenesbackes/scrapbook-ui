import type { ContributionCategory } from './guestContribution'
import { validateMediaDuration, type MediaIssue, type MediaKind } from './mediaFiles'

const previewTimeout = 15_000

export function releaseMediaElement(element: HTMLMediaElement) {
  if (!element.paused) element.pause()
  element.removeAttribute('src')
  element.load()
}

type Probe = { kind: 'ready'; durationSeconds: number } | { kind: 'failed'; issue: MediaIssue } | { kind: 'cancelled' }

export function probeMedia(url: string, kind: MediaKind, category: ContributionCategory, signal: AbortSignal): Promise<Probe> {
  if (signal.aborted) return Promise.resolve({ kind: 'cancelled' })
  const element = document.createElement('video')
  element.preload = 'auto'
  element.muted = true
  return new Promise(resolve => {
    const timer = window.setTimeout(() => finish({ kind: 'failed', issue: 'preview' }), previewTimeout)
    function finish(result: Probe) {
      window.clearTimeout(timer)
      signal.removeEventListener('abort', cancel)
      element.onloadedmetadata = null
      element.onloadeddata = null
      element.onerror = null
      releaseMediaElement(element)
      resolve(result)
    }
    function cancel() { finish({ kind: 'cancelled' }) }
    function validate() {
      const issue = validateMediaDuration(category, kind, element.duration)
      if (issue) { finish({ kind: 'failed', issue }); return false }
      if ((element.videoWidth > 0) !== (kind === 'video')) {
        finish({ kind: 'failed', issue: 'format' })
        return false
      }
      return true
    }
    signal.addEventListener('abort', cancel, { once: true })
    element.onerror = () => finish({ kind: 'failed', issue: 'preview' })
    element.onloadedmetadata = validate
    element.onloadeddata = () => {
      if (validate()) finish({ kind: 'ready', durationSeconds: element.duration })
    }
    element.src = url
  })
}
