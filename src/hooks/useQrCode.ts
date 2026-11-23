import { useEffect, useState } from 'react'
import type { QrCodeMatrix } from '../lib/qrCodeMatrix'

type QrView = { kind: 'loading' | 'failed' } | { kind: 'ready'; matrix: QrCodeMatrix }

export function useQrCode(url: string): QrView {
  const [result, setResult] = useState<{ url: string; view: QrView }>()

  useEffect(() => {
    let active = true
    void import('../lib/qrCodeMatrix').then(module => module.encodeQrCode(url)).then(matrix => {
      if (active) setResult({ url, view: { kind: 'ready', matrix } })
    }, () => {
      if (active) setResult({ url, view: { kind: 'failed' } })
    })
    return () => { active = false }
  }, [url])

  return result?.url === url ? result.view : { kind: 'loading' }
}
