import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { QrCode } from '../../components/QrCode'
import { environment } from '../../config/environment'
import { useLinkClipboard } from '../../hooks/useLinkClipboard'
import { useQrCode } from '../../hooks/useQrCode'
import { invitationUrl } from '../../utils/invitationUrl'
import { createInvitation, getCurrentInvitation, type Invitation, type InvitationResult } from './invitationService'
import { watchPageResume } from './watchPageResume'
import './invitation.css'

type InvitationView = InvitationResult | { kind: 'loading' | 'issuing' | 'uncertain' }

const expiryFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short',
})

function PendingInvitation({ invitation, onReplace }: { invitation: Invitation; onReplace: () => void }) {
  const url = invitationUrl(invitation.token, environment.publicSiteOrigin, window.location.origin)
  const [confirming, setConfirming] = useState(false)
  const replaceButton = useRef<HTMLButtonElement>(null)
  const confirmButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (confirming) confirmButton.current?.focus()
  }, [confirming])

  function cancel() {
    replaceButton.current?.focus()
    setConfirming(false)
  }

  return (
    <section aria-label="Convite pendente">
      <p>Válido até <time dateTime={invitation.expiresAt}>{expiryFormatter.format(new Date(invitation.expiresAt))}</time> (horário de Brasília).</p>
      {url ? <InvitationShare url={url} /> : <p role="alert">O endereço do convite está indisponível neste ambiente.</p>}
      <button type="button" ref={replaceButton} aria-expanded={confirming} aria-controls={confirming ? 'invitation-replacement' : undefined}
        onClick={() => setConfirming(value => !value)}>Substituir convite</button>
      {confirming && (
        <fieldset className="invitation-confirm" id="invitation-replacement">
          <legend>O convite anterior deixará de funcionar.</legend>
          <button type="button" onClick={onReplace} ref={confirmButton}>Confirmar substituição</button>
          <button type="button" onClick={cancel}>Cancelar</button>
        </fieldset>
      )}
    </section>
  )
}

function InvitationShare({ url }: { url: string }) {
  const clipboard = useLinkClipboard(url)
  const qr = useQrCode(url)
  return (
    <>
      <label htmlFor="invitation-link">Link do convite</label>
      <div className="invitation-controls">
        <input id="invitation-link" type="text" inputMode="url" readOnly value={url} ref={clipboard.field} spellCheck={false} />
        <button type="button" onClick={() => void clipboard.copy()}>Copiar link</button>
      </div>
      <p role="status">{clipboard.feedback}</p>
      {qr.kind === 'loading' && <p role="status">Preparando QR code…</p>}
      {qr.kind === 'failed' && <p role="alert">QR code indisponível. Use o link do convite.</p>}
      {qr.kind === 'ready' && <QrCode matrix={qr.matrix} label="QR code do convite de responsável" />}
    </>
  )
}

export function EventInvitationPage({ eventId }: { eventId: string }) {
  const [view, setView] = useState<InvitationView>({ kind: 'loading' })
  const operation = useRef<AbortController | null>(null)
  const requestKey = useRef<string | null>(null)
  const busy = view.kind === 'loading' || view.kind === 'issuing'

  async function run(action: (signal: AbortSignal) => Promise<void>) {
    if (operation.current) return
    const request = new AbortController()
    operation.current = request
    try {
      await action(request.signal)
    } finally {
      if (operation.current === request) operation.current = null
    }
  }

  function reload() {
    void run(async signal => {
      setView({ kind: 'loading' })
      const result = await getCurrentInvitation(eventId, signal)
      if (!signal.aborted) setView(result)
    })
  }

  const loadInvitation = useEffectEvent(reload)
  const resume = useEffectEvent(() => {
    if (view.kind === 'available' || view.kind === 'pending' || view.kind === 'full') reload()
  })

  useEffect(() => {
    loadInvitation()
    const stopWatching = watchPageResume(() => resume())
    return () => {
      stopWatching()
      operation.current?.abort()
      operation.current = null
      requestKey.current = null
    }
  }, [eventId])

  function issue() {
    void run(async signal => {
      if (typeof crypto.randomUUID !== 'function') {
        setView({ kind: 'failed' })
        return
      }

      const key = requestKey.current ?? crypto.randomUUID()
      requestKey.current = key
      setView({ kind: 'issuing' })
      const result = await createInvitation(eventId, key, signal)
      if (signal.aborted) return
      if (result.kind === 'failed') {
        setView({ kind: 'uncertain' })
        return
      }

      requestKey.current = null
      setView(result)
      if (result.kind !== 'locked' && result.kind !== 'unavailable' && result.kind !== 'full') return

      const current = await getCurrentInvitation(eventId, signal)
      if (signal.aborted || current.kind === 'failed') return
      if (result.kind !== 'locked' || current.kind === 'session' || current.kind === 'not-found') setView(current)
    })
  }

  return (
    <main id="conteudo" className="main event-page invitation-page" tabIndex={-1} aria-busy={busy}>
      <h1>Convidar responsável</h1>
      {view.kind === 'loading' && <p role="status">Consultando convite…</p>}
      {view.kind === 'issuing' && <p role="status">Gerando convite…</p>}
      {view.kind === 'available' && (
        <button type="button" onClick={() => void issue()}>Gerar convite</button>
      )}
      {view.kind === 'pending' && (
        <PendingInvitation key={view.invitation.id} invitation={view.invitation} onReplace={() => void issue()} />
      )}
      {view.kind === 'locked' && <p role="status">Os convites deste evento estão travados.</p>}
      {view.kind === 'full' && <p role="status">Este evento já tem dois responsáveis.</p>}
      {view.kind === 'session' && <p role="alert">Sua sessão terminou. Entre novamente.</p>}
      {view.kind === 'not-found' && <p role="alert">Evento indisponível para esta conta.</p>}
      {view.kind === 'unavailable' && <p role="alert">Este convite não está mais disponível. Atualize a consulta.</p>}
      {view.kind === 'failed' && <p role="alert">Serviço temporariamente indisponível.</p>}
      {(view.kind === 'unavailable' || view.kind === 'failed') && <button type="button" onClick={reload}>Atualizar convite</button>}
      {view.kind === 'uncertain' && (
        <>
          <p role="alert">Não foi possível confirmar a emissão. Recupere a tentativa para consultar o convite.</p>
          <button type="button" onClick={() => void issue()}>Recuperar convite</button>
        </>
      )}
      <p><a href={'/meus-eventos/' + eventId}>Voltar aos detalhes</a></p>
    </main>
  )
}
