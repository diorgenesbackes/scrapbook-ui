import { showCivil } from '../../utils/showCivil'
import { useEventOpeningStatus } from './useEventOpeningStatus'
import './events.css'

function plural(count: number, unit: string) {
  return count + ' ' + unit + (count === 1 ? '' : 's')
}

function countdown(milliseconds: number) {
  const minutes = Math.ceil(milliseconds / 60_000)
  return [
    plural(Math.floor(minutes / 1440), 'dia'),
    plural(Math.floor(minutes / 60) % 24, 'hora'),
    plural(minutes % 60, 'minuto'),
  ].join(', ')
}

export function EventMemoriesPage({ eventId }: { eventId: string }) {
  const { view, retry } = useEventOpeningStatus(eventId)

  return (
    <main id="conteudo" className="main event-page" tabIndex={-1}>
      {view.kind === 'expired' || view.kind === 'not-found'
        ? <a href="/meus-eventos">Voltar a Meus eventos</a>
        : <a href={'/meus-eventos/' + eventId}>Voltar ao evento</a>}
      <h1>Lembranças</h1>
      <section aria-label="Abertura das lembranças" aria-busy={view.kind === 'loading'}>
        {view.kind === 'loading' && <p role="status">Verificando a abertura…</p>}
        {view.kind === 'open' && <p role="status">As lembranças estão abertas.</p>}
        {view.kind === 'closed' && (
          <>
            <h2>Lembranças guardadas</h2>
            <p>Abertura em <time dateTime={view.opensOn}>{showCivil(view.opensOn)}</time> à meia-noite de Brasília.</p>
            <p role="timer" aria-label="Tempo até a abertura">{countdown(view.remaining)}</p>
          </>
        )}
        {view.kind === 'expired' && <p role="alert">Sua sessão terminou. Entre novamente.</p>}
        {view.kind === 'not-found' && <p role="alert">Evento indisponível para esta conta.</p>}
        {view.kind === 'failed' && (
          <>
            <p role="alert">Não foi possível consultar a abertura.</p>
            <button type="button" onClick={retry}>Tentar novamente</button>
          </>
        )}
      </section>
    </main>
  )
}
