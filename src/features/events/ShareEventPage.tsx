import { useEffect, useState } from 'react'
import { QrCode } from '../../components/QrCode'
import { environment } from '../../config/environment'
import { useQrCode } from '../../hooks/useQrCode'
import { useLinkClipboard } from '../../hooks/useLinkClipboard'
import { downloadQrCode, qrPng, qrSvg } from '../../lib/qrCodeFiles'
import { publicEventUrl } from '../../utils/publicEventUrl'
import { getEvent, getEventPublicLink } from './eventService'
import './share-event.css'

type ShareEventView = { kind: 'loading' | 'expired' | 'not-found' | 'failed' | 'origin' }
  | { kind: 'ready'; name: string; url: string }

function ShareEventCard({ name, url }: { name: string; url: string }) {
  const qr = useQrCode(url)
  const clipboard = useLinkClipboard(url)
  const [failed, setFailed] = useState(false)

  async function download(extension: 'png' | 'svg') {
    if (qr.kind !== 'ready') return
    setFailed(false)
    try {
      const blob = extension === 'png' ? await qrPng(qr.matrix) : qrSvg(qr.matrix)
      downloadQrCode(blob, extension)
    } catch {
      setFailed(true)
    }
  }

  return (
    <section className="share-print" aria-label="Compartilhar com convidados">
      <h1>{name}</h1>
      <div className="share-controls">
        <label htmlFor="public-event-url">Link dos convidados</label>
        <div className="share-actions">
          <input id="public-event-url" type="text" inputMode="url" value={url} readOnly ref={clipboard.field} spellCheck={false} />
          <button type="button" onClick={() => void clipboard.copy()}>Copiar link</button>
        </div>
        <p role="status">{clipboard.feedback}</p>
      </div>
      {qr.kind === 'ready' && <QrCode matrix={qr.matrix} />}
      <p className="print-link">{url}</p>
      <div className="share-controls">
        {qr.kind === 'loading' && <p role="status">Preparando QR code…</p>}
        {qr.kind === 'failed' && <p role="alert">O QR code está indisponível. Use o link dos convidados.</p>}
        {failed && <p role="alert">Não foi possível baixar o QR code. Tente novamente.</p>}
        <div className="share-actions">
          <button type="button" disabled={qr.kind !== 'ready'} onClick={() => void download('png')}>Baixar PNG</button>
          <button type="button" disabled={qr.kind !== 'ready'} onClick={() => void download('svg')}>Baixar SVG</button>
          <button type="button" disabled={qr.kind !== 'ready'} onClick={() => window.print()}>Imprimir</button>
        </div>
      </div>
    </section>
  )
}

export function ShareEventPage({ eventId }: { eventId: string }) {
  const [view, setView] = useState<ShareEventView>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const request = new AbortController()
    void Promise.all([getEvent(eventId, request.signal), getEventPublicLink(eventId, request.signal)]).then(([event, link]) => {
      if (request.signal.aborted) return
      if (event.kind === 'expired' || link.kind === 'expired') setView({ kind: 'expired' })
      else if (event.kind === 'not-found' || link.kind === 'not-found') setView({ kind: 'not-found' })
      else if (event.kind !== 'ready' || link.kind !== 'ready') setView({ kind: 'failed' })
      else {
        const url = publicEventUrl(link.data, environment.publicSiteOrigin, window.location.origin)
        setView(url ? { kind: 'ready', name: event.data.name, url } : { kind: 'origin' })
      }
    })
    return () => request.abort()
  }, [eventId, attempt])

  return (
    <main id="conteudo" tabIndex={-1} className="main event-page share-event" aria-busy={view.kind === 'loading'}>
      {view.kind !== 'ready' && <h1>Compartilhar com convidados</h1>}
      {view.kind === 'loading' && <p role="status">Carregando link…</p>}
      {view.kind === 'expired' && <p role="alert">Sua sessão terminou. Entre novamente.</p>}
      {view.kind === 'not-found' && <p role="alert">Evento indisponível para esta conta.</p>}
      {view.kind === 'origin' && <p role="alert">O endereço público deste ambiente está indisponível.</p>}
      {view.kind === 'failed' && (
        <>
          <p role="alert">Serviço temporariamente indisponível. Tente novamente em instantes.</p>
          <button type="button" onClick={() => { setView({ kind: 'loading' }); setAttempt(value => value + 1) }}>Tentar novamente</button>
        </>
      )}
      {view.kind === 'ready' && <ShareEventCard key={view.url} name={view.name} url={view.url} />}
      <a className="share-controls" href={'/meus-eventos/' + eventId}>Voltar aos detalhes</a>
    </main>
  )
}
