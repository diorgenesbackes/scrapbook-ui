import type { ReactNode } from 'react'
import cover from '../../assets/default-cover.jpg'
import { environment } from '../../config/environment'
import { publicEventUrl } from '../../utils/publicEventUrl'
import { showCivil } from '../../utils/showCivil'
import { PublicEventQr } from './PublicEventQr'
import type { PublicEvent, SubmissionState } from './publicEventService'
import { usePublicEvent } from './usePublicEvent'
import './public-event.css'

export function PublicEventPage({ code, renderEvent }: {
  code: string | undefined
  renderEvent?: (event: PublicEvent, state: SubmissionState) => ReactNode
}) {
  const { view, retry } = usePublicEvent(code)
  const shareUrl = code && publicEventUrl(code, environment.publicSiteOrigin, window.location.origin)

  return (
    <main id="conteudo" tabIndex={-1} className="main guest-page" aria-busy={view.kind === 'loading'}>
      {view.kind === 'loading' && (
        <>
          <h1>Evento</h1>
          <p role="status">Carregando evento…</p>
        </>
      )}
      {view.kind === 'unavailable' && (
        <>
          <h1>Evento indisponível.</h1>
          <p><a href="/">Voltar ao início</a></p>
        </>
      )}
      {view.kind === 'failed' && (
        <>
          <h1>Evento</h1>
          <p role="alert">Serviço temporariamente indisponível. Tente novamente em instantes.</p>
          {view.correlationId && <p>Código para suporte: <span>{view.correlationId}</span></p>}
          <button type="button" onClick={retry} disabled={!view.canRetry}>Tentar novamente</button>
        </>
      )}
      {view.kind === 'ready' && (renderEvent?.(view.event, view.state) ?? (
        <>
          <img className="guest-cover" src={cover} alt="" width={880} height={495} />
          <h1>{view.event.name}</h1>
          <p><time dateTime={view.event.startsAt}>{showCivil(view.event.startsAt)}</time> · Horário de Brasília</p>
          <p className="guest-welcome">{view.event.welcomeMessage}</p>
          <section className="guest-submissions" aria-labelledby="guest-submissions-heading">
            <h2 id="guest-submissions-heading">Envios</h2>
            {view.state !== 'open' && <div role="status">
              {view.state === 'before' && (
                <>
                  <p>Novos envios ainda não estão disponíveis.</p>
                  <p>Os envios abrem em <time dateTime={view.event.submissionWindow.opensAt}>
                    {showCivil(view.event.submissionWindow.opensAt)}
                  </time> (horário de Brasília).</p>
                </>
              )}
              {view.state === 'closed' && <p>O prazo para novos envios terminou.</p>}
            </div>}
            {view.state === 'open' && (
              <div className="guest-actions">
                {code && <a className="guest-action-link" href={'/e/' + code + '/depoimento'}>Deixe um depoimento</a>}
                <button type="button" disabled>Registre um momento</button>
              </div>
            )}
          </section>
          {shareUrl && <PublicEventQr url={shareUrl} />}
        </>
      ))}
    </main>
  )
}
