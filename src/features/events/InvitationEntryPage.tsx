import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { isInvitationToken } from '../../utils/invitationUrl'
import { acceptInvitation, previewInvitation, type AcceptanceProblem, type InvitationPreview } from './invitationService'
import { watchPageResume } from './watchPageResume'

type EntryView = InvitationPreview | { kind: 'loading' | 'accepting' | 'uncertain' }

const messages: Record<AcceptanceProblem, string> = {
  session: 'Entre com uma conta de e-mail confirmado para aceitar o convite.',
  unconfirmed: 'Confirme seu e-mail para aceitar o convite.',
  unavailable: 'Este convite não está mais disponível. Solicite um novo.',
  used: 'Este convite já foi usado.',
  full: 'Este evento já tem dois responsáveis.',
  locked: 'Os convites deste evento estão travados.',
  linked: 'Você já é responsável por este evento.',
  failed: 'Serviço temporariamente indisponível. Tente novamente.',
}

const expiryFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short',
})

export function InvitationEntryPage() {
  const [token] = useState(() => {
    const fragment = window.location.hash.slice(1)
    return isInvitationToken(fragment) ? fragment : null
  })
  const [view, setView] = useState<EntryView>(token ? { kind: 'loading' } : { kind: 'problem', reason: 'unavailable' })
  const [refreshing, setRefreshing] = useState(false)
  const operation = useRef<AbortController | null>(null)

  useEffect(() => {
    if (window.location.hash && window.location.hash !== '#conteudo') {
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
    }
  }, [])

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

  function retryPreview(background = false) {
    if (!token) return
    void run(async signal => {
      setRefreshing(background)
      if (!background) setView({ kind: 'loading' })
      try {
        const result = await previewInvitation(token, signal)
        if (!signal.aborted) setView(result)
      } finally {
        if (!signal.aborted) setRefreshing(false)
      }
    })
  }

  const loadPreview = useEffectEvent(retryPreview)
  const resume = useEffectEvent(() => {
    if (view.kind === 'eligible') retryPreview(true)
  })

  useEffect(() => {
    loadPreview()
    const stopWatching = watchPageResume(() => resume())
    return () => {
      stopWatching()
      operation.current?.abort()
      operation.current = null
    }
  }, [])

  useEffect(() => {
    if (view.kind === 'accepted') window.location.assign('/meus-eventos/' + view.eventId)
  }, [view])

  function accept() {
    if (!token || (view.kind !== 'eligible' && view.kind !== 'uncertain')) return
    void run(async signal => {
      setView({ kind: 'accepting' })
      const result = await acceptInvitation(token, signal)
      if (signal.aborted) return
      setView(result.kind === 'accepted' || (result.kind === 'problem' && result.reason !== 'failed')
        ? result : { kind: 'uncertain' })
    })
  }

  const busy = refreshing || view.kind === 'loading' || view.kind === 'accepting'

  return (
    <main id="conteudo" className="main event-page" tabIndex={-1} aria-busy={busy}>
      <h1>Convite para administrar um evento</h1>
      {view.kind === 'loading' && <p role="status">Consultando convite…</p>}
      {view.kind === 'eligible' && (
        <section aria-label="Evento convidado">
          <h2>{view.eventName}</h2>
          <p>Válido até <time dateTime={view.expiresAt}>{expiryFormatter.format(new Date(view.expiresAt))}</time> (horário de Brasília).</p>
          <button type="button" aria-disabled={refreshing || undefined} onClick={() => void accept()}>Aceitar convite</button>
        </section>
      )}
      {view.kind === 'accepting' && <p role="status">Aceitando convite…</p>}
      {view.kind === 'accepted' && (
        <p role="status">Convite aceito. <a href={'/meus-eventos/' + view.eventId}>Abrir evento</a></p>
      )}
      {view.kind === 'uncertain' && (
        <>
          <p role="alert">Não foi possível confirmar o aceite. Recupere a tentativa para consultar o resultado.</p>
          <button type="button" onClick={() => void accept()}>Recuperar aceite</button>
        </>
      )}
      {view.kind === 'problem' && (
        <>
          <p role="alert">{messages[view.reason]}</p>
          {view.reason === 'failed' && <button type="button" onClick={() => retryPreview()}>Tentar novamente</button>}
          {view.reason === 'linked' && <p><a href="/meus-eventos">Abrir Meus eventos</a></p>}
        </>
      )}
      <p><a href="/">Voltar ao início</a></p>
    </main>
  )
}
