import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { getPublicEvent } from '../public-event/publicEventService'

const brasilia = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

export function SubmissionReceipt({ eventCode, confirmedAt, open, category = 'testimonial', onRestart }: {
  eventCode: string
  confirmedAt: string
  open: boolean
  category?: 'testimonial' | 'moment'
  onRestart: () => void
}) {
  const [another, setAnother] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  useLayoutEffect(() => { heading.current?.focus() }, [])

  useEffect(() => {
    const controller = new AbortController()
    void getPublicEvent(eventCode, controller.signal).then(result => {
      if (!controller.signal.aborted && result.kind === 'ready') setAnother(result.event.submissionWindow.state === 'open')
    })
    return () => controller.abort()
  }, [eventCode, confirmedAt])

  return (
    <section className="testimonial" aria-labelledby="submission-receipt-title">
      <h1 id="submission-receipt-title" ref={heading} tabIndex={-1}>Recebimento confirmado</h1>
      <p>Sua contribuição foi guardada.</p>
      <p><time dateTime={confirmedAt}>{brasilia.format(new Date(confirmedAt))}</time> · Horário de Brasília</p>
      {open && another && (
        <div className="testimonial-actions">
          {category === 'moment' ? (
            <>
              <a href={'/e/' + eventCode + '/depoimento'}>Deixar outro depoimento</a>
              <button type="button" onClick={onRestart}>Registrar um momento</button>
            </>
          ) : (
            <>
              <button type="button" onClick={onRestart}>Deixar outro depoimento</button>
              <a href={'/e/' + eventCode + '/momento'}>Registrar um momento</a>
            </>
          )}
        </div>
      )}
      <a href={'/e/' + eventCode}>Voltar ao evento</a>
    </section>
  )
}
