import { useEffect, useRef, useState } from 'react'
import { readPhoto, type PhotoIssue, type SelectedPhoto } from './photoFiles'

type RejectedPhoto = { name: string; issue: PhotoIssue }

async function canPreview(url: string, signal: AbortSignal) {
  const image = new Image()
  function stop() { image.removeAttribute('src') }
  signal.addEventListener('abort', stop, { once: true })
  try {
    image.src = url
    await image.decode()
    return image.naturalWidth > 0 && image.naturalHeight > 0
  } catch {
    return false
  } finally {
    signal.removeEventListener('abort', stop)
    stop()
  }
}

export function usePhotoSelection(maximum: number) {
  const [photos, setPhotos] = useState<SelectedPhoto[]>([])
  const [rejected, setRejected] = useState<RejectedPhoto[]>([])
  const [busy, setBusy] = useState(false)
  const active = useRef<AbortController | null>(null)
  const nextId = useRef(0)
  const urls = useRef(new Set<string>())

  useEffect(() => {
    const pending = urls.current
    return () => {
      active.current?.abort()
      active.current = null
      pending.forEach(url => URL.revokeObjectURL(url))
      pending.clear()
    }
  }, [])

  function release(url: string) {
    if (urls.current.delete(url)) URL.revokeObjectURL(url)
  }

  async function select(files: readonly File[], replacement?: SelectedPhoto) {
    if (active.current || files.length === 0) return
    const attempt = new AbortController()
    active.current = attempt
    setBusy(true)
    const capacity = replacement ? 1 : maximum - photos.length
    const accepted: SelectedPhoto[] = []
    const failures: RejectedPhoto[] = []

    try {
      for (const file of files) {
        if (accepted.length >= capacity) {
          failures.push({ name: file.name, issue: 'quantity' })
          continue
        }
        const result = await readPhoto(file)
        if (attempt.signal.aborted) return
        if (result !== 'jpeg' && result !== 'png' && result !== 'heic' && result !== 'heif') {
          failures.push({ name: file.name, issue: result })
          continue
        }
        let url: string
        try {
          url = URL.createObjectURL(file.slice(0, file.size, 'image/' + result))
        } catch {
          failures.push({ name: file.name, issue: 'preview' })
          continue
        }
        urls.current.add(url)
        const visible = await canPreview(url, attempt.signal)
        if (attempt.signal.aborted) return
        if (visible) {
          accepted.push({ id: ++nextId.current, file, url, format: result, sizeBytes: file.size })
        } else {
          release(url)
          failures.push({ name: file.name, issue: 'preview' })
        }
      }

      const first = accepted[0]
      if (replacement && first) {
        release(replacement.url)
        setPhotos(photos.map(photo => photo.id === replacement.id ? { ...first, id: replacement.id } : photo))
      } else {
        setPhotos([...photos, ...accepted])
      }
      setRejected(failures)
    } finally {
      if (active.current === attempt) {
        active.current = null
        setBusy(false)
      }
    }
  }

  function remove(photo: SelectedPhoto) {
    if (active.current) return
    release(photo.url)
    setPhotos(items => items.filter(item => item.id !== photo.id))
  }

  function clear() {
    active.current?.abort()
    active.current = null
    for (const url of urls.current) release(url)
    setPhotos([])
    setRejected([])
    setBusy(false)
  }

  return { photos, rejected, busy, select, remove, clear, dismissRejected: () => setRejected([]) }
}
