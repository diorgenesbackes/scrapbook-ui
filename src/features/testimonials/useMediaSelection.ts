import { useEffect, useRef, useState } from 'react'
import type { ContributionCategory } from './guestContribution'
import { mediaMime, readMediaContainer, validateMediaSize, type MediaIssue, type MediaKind, type SelectedMedia } from './mediaFiles'
import { probeMedia } from './mediaPreview'

export function useMediaSelection(category: ContributionCategory) {
  const [selected, setSelected] = useState<SelectedMedia | null>(null)
  const [issue, setIssue] = useState<{ name: string; code: MediaIssue } | null>(null)
  const [busy, setBusy] = useState(false)
  const [previewFailed, setPreviewFailed] = useState(false)
  const active = useRef<AbortController | null>(null)
  const acceptedUrl = useRef<string | null>(null)

  function release() {
    active.current?.abort()
    active.current = null
    if (acceptedUrl.current) URL.revokeObjectURL(acceptedUrl.current)
    acceptedUrl.current = null
  }

  useEffect(() => release, [])

  async function select(file: File | undefined, kind: MediaKind) {
    if (!file || active.current) return
    const initialIssue = validateMediaSize(category, kind, file.size)
    if (initialIssue) { setIssue({ name: file.name, code: initialIssue }); return }

    const attempt = new AbortController()
    active.current = attempt
    setBusy(true)
    setIssue(null)
    let url: string | null = null
    try {
      const container = await readMediaContainer(file, kind)
      if (attempt.signal.aborted) return
      if (!container) { setIssue({ name: file.name, code: 'format' }); return }
      url = URL.createObjectURL(file.slice(0, file.size, mediaMime(container, kind)))

      const result = await probeMedia(url, kind, category, attempt.signal)
      if (attempt.signal.aborted || result.kind === 'cancelled') return
      if (result.kind === 'failed') { setIssue({ name: file.name, code: result.issue }); return }

      if (acceptedUrl.current) URL.revokeObjectURL(acceptedUrl.current)
      acceptedUrl.current = url
      setSelected({ file, kind, container, sizeBytes: file.size, durationSeconds: result.durationSeconds, url })
      setPreviewFailed(false)
      url = null
    } catch {
      if (!attempt.signal.aborted) setIssue({ name: file.name, code: 'preview' })
    } finally {
      if (url) URL.revokeObjectURL(url)
      if (active.current === attempt) {
        active.current = null
        setBusy(false)
      }
    }
  }

  function clear() {
    release()
    setSelected(null)
    setIssue(null)
    setBusy(false)
    setPreviewFailed(false)
  }

  return { selected, issue, busy, previewFailed, select, clear, keepSelection: () => setIssue(null), setPreviewFailed }
}
