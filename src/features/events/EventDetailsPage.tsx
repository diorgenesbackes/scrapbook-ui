import { useCallback, useEffect, useState } from 'react'
import { showCivil } from '../../utils/showCivil'
import { getEvent, type EventDetail } from './eventService'
import { EventDetailsForm } from './EventDetailsForm'
import { EventOpeningForm } from './EventOpeningForm'
import { watchPageResume } from './watchPageResume'
import cover from '../../assets/default-cover.jpg'
import './events.css'

export function EventDetailsPage({ eventId }: { eventId: string }) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<Awaited<ReturnType<typeof getEvent>> | null>(null)
  const updateEvent = useCallback((data: EventDetail) => {
    setResult(current => {
      if (current?.kind === 'expired' || current?.kind === 'not-found') return current
      if (current?.kind === 'ready') {
        const version = BigInt(data.version)
        const currentVersion = BigInt(current.data.version)
        if (version < currentVersion || (!current.data.canEditDetails && data.canEditDetails)) return current
        if (version === currentVersion && current.data.openingPolicy.state !== 'flexible'
          && data.openingPolicy.state === 'flexible') return current
      }
      return { kind: 'ready', data }
    })
  }, [])

  function lockDetails() {
    setResult(current => current?.kind === 'ready'
      ? { kind: 'ready', data: { ...current.data, canEditDetails: false } }
      : current)
  }

  function clearEvent(kind: 'expired' | 'not-found') {
    setResult({ kind })
  }

  useEffect(() => {
    let request: AbortController | null = null

    async function refresh() {
      if (request) return
      const controller = new AbortController()
      request = controller
      try {
        const value = await getEvent(eventId, controller.signal)
        if (controller.signal.aborted) return
        if (value.kind === 'ready') updateEvent(value.data)
        else if (value.kind === 'expired' || value.kind === 'not-found') clearEvent(value.kind)
        else setResult(current => current ?? value)
      } finally {
        request = null
      }
    }

    const stopWatching = watchPageResume(() => void refresh())
    void refresh()
    return () => {
      stopWatching()
      request?.abort()
    }
  }, [eventId, attempt, updateEvent])

  return (
    <main id="conteudo" className="main event-page" tabIndex={-1}>
      <a href="/meus-eventos">Voltar a Meus eventos</a>
      {result?.kind === 'ready' ? (
        <>
          <h1>{result.data.name}</h1>
          <p><time dateTime={result.data.startsAt}>{showCivil(result.data.startsAt)}</time> · Horário de Brasília</p>
          <img className="event-cover" src={cover} alt="" width="880" height="495" />
          <p className="event-welcome">{result.data.welcomeMessage}</p>
          <h2>Prazos do evento</h2>
          <dl>
            <dt>Início dos envios</dt><dd>{showCivil(result.data.submissionOpensAt)}</dd>
            <dt>Encerramento de novos envios</dt><dd>{showCivil(result.data.submissionClosesAt)}</dd>
            <dt>Prazo para concluir envios iniciados</dt><dd>{showCivil(result.data.completionDeadlineAt)}</dd>
            <dt>Abertura das lembranças</dt><dd>{result.data.openingPolicy.opensOn ? showCivil(result.data.openingPolicy.opensOn) : 'Imediata'}</dd>
          </dl>
          <p><a href={'/meus-eventos/' + result.data.id + '/lembrancas'}>Ver lembranças</a></p>
          <p><a href={'/meus-eventos/' + result.data.id + '/compartilhar'}>Compartilhar com convidados</a></p>
          {result.data.canEditDetails && <p><a href={'/meus-eventos/' + result.data.id + '/convidar'}>Convidar responsável</a></p>}
          <EventDetailsForm event={result.data} onUpdated={updateEvent} onLocked={lockDetails} onAccessLost={clearEvent} />
          <EventOpeningForm event={result.data} onUpdated={updateEvent} onAccessLost={clearEvent} />
        </>
      ) : (
        <>
          <h1>Detalhes do evento</h1>
          {!result && <p role="status">Carregando evento…</p>}
          {result?.kind === 'expired' && <p role="alert">Sua sessão terminou. Entre novamente.</p>}
          {result?.kind === 'not-found' && <p role="alert">Evento indisponível para esta conta.</p>}
          {result?.kind === 'failed' && (
            <div><p role="alert">Serviço temporariamente indisponível. Tente novamente em instantes.</p>
              <button type="button" onClick={() => { setResult(null); setAttempt(attempt + 1) }}>Tentar novamente</button></div>
          )}
        </>
      )}
    </main>
  )
}
