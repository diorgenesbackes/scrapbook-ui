import { useEffect, useState } from 'react'
import { showCivil } from './eventDates'
import { getEvent } from './eventService'
import { EventDetailsForm } from './EventDetailsForm'
import { EventOpeningForm } from './EventOpeningForm'
import cover from './default-cover.jpg'
import './events.css'

export function EventDetailsPage({ eventId }: { eventId: string }) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<Awaited<ReturnType<typeof getEvent>> | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    void getEvent(eventId, controller.signal).then(value => {
      if (!controller.signal.aborted) setResult(value)
    })
    return () => controller.abort()
  }, [eventId, attempt])

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
          <EventDetailsForm key={result.data.id} event={result.data} onUpdated={data => setResult({ kind: 'ready', data })}
            onAccessLost={kind => setResult({ kind })} />
          <EventOpeningForm key={result.data.id} event={result.data} onUpdated={data => setResult({ kind: 'ready', data })}
            onAccessLost={kind => setResult({ kind })} />
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
