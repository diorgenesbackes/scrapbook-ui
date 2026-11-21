import { useEffect, useState } from 'react'
import { showCivil } from './eventDates'
import { listEvents } from './eventService'
import cover from './default-cover.jpg'
import './events.css'

export function EventListPage() {
  const [request, setRequest] = useState<{ cursor: string | null }>({ cursor: null })
  const [result, setResult] = useState<Awaited<ReturnType<typeof listEvents>> | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    void listEvents(request.cursor, controller.signal).then(value => {
      if (!controller.signal.aborted) setResult(value)
    })
    return () => controller.abort()
  }, [request])

  function load(cursor: string | null) {
    setResult(null)
    setRequest({ cursor })
  }

  return (
    <main id="conteudo" className="main event-page" tabIndex={-1}>
      <div className="event-title">
        <h1>Meus eventos</h1>
        <a className="event-primary" href="/meus-eventos/novo">Criar evento</a>
      </div>
      <section aria-label="Eventos vinculados" aria-busy={result === null}>
        {!result && <p role="status">Carregando eventos…</p>}
        {result?.kind === 'expired' && <p role="alert">Sua sessão terminou. Entre novamente.</p>}
        {result?.kind === 'failed' && (
          <div><p role="alert">Serviço temporariamente indisponível. Tente novamente em instantes.</p>
            <button type="button" onClick={() => load(request.cursor)}>Tentar novamente</button></div>
        )}
        {result?.kind === 'ready' && (
          <>
            {result.data.items.length === 0 ? <p role="status">Nenhum evento para exibir.</p> : (
              <ul className="event-grid">
                {result.data.items.map(event => (
                  <li className="event-card" key={event.id}>
                    <img src={cover} alt="" loading="lazy" width="880" height="495" />
                    <h2><a href={'/meus-eventos/' + event.id}>{event.name}</a></h2>
                    <p><time dateTime={event.startsAt}>{showCivil(event.startsAt)}</time></p>
                  </li>
                ))}
              </ul>
            )}
            <div className="event-actions">
              <button type="button" onClick={() => load(null)}>Atualizar lista</button>
              {result.data.nextCursor && <button type="button" onClick={() => load(result.data.nextCursor)}>Próxima página</button>}
            </div>
          </>
        )}
      </section>
    </main>
  )
}
