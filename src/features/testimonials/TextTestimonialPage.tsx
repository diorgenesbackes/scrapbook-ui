import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { GuestAccessNotice } from '../guest-identification/GuestIdentificationForm'
import { GuestIdentificationStep } from '../guest-identification/GuestIdentificationStep'
import { PublicEventPage } from '../public-event/PublicEventPage'
import { DraftDiscardDialog } from './DraftDiscardDialog'
import { TextTestimonialEditor } from './TextTestimonialEditor'
import { identifyTextTestimonial, reviewTextTestimonial, type IdentifiedTextTestimonial, type ReviewedTextTestimonial } from './testimonialText'
import './testimonials.css'

type Step =
  | { kind: 'choose' | 'write' }
  | { kind: 'review' | 'identify'; contribution: ReviewedTextTestimonial }
  | { kind: 'identified'; contribution: IdentifiedTextTestimonial; remembered: boolean }

type PendingExit = { href: string | null; trigger: HTMLElement | null }

const titles = {
  choose: 'Deixe um depoimento',
  write: 'Escrever depoimento',
  review: 'Revisar depoimento',
  identify: 'Identificação',
  identified: 'Revisar depoimento',
}

export function TextTestimonialPage({ eventCode, notice }: { eventCode: string; notice?: GuestAccessNotice }) {
  const [text, setText] = useState('')
  const [step, setStep] = useState<Step>({ kind: 'choose' })
  const [exit, setExit] = useState<PendingExit | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const confirmedExit = useRef(false)
  const dirty = text.length > 0

  useLayoutEffect(() => {
    heading.current?.focus()
  }, [step.kind])

  useEffect(() => {
    if (!dirty) return

    function guardLink(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null
      if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return
      const target = new URL(link.href)
      if (target.origin !== window.location.origin) return
      if (target.hash && target.pathname === window.location.pathname && target.search === window.location.search) return
      event.preventDefault()
      setExit({ href: target.href, trigger: link })
    }

    function guardUnload(event: BeforeUnloadEvent) {
      if (confirmedExit.current) return
      event.preventDefault()
      event.returnValue = ''
    }

    document.addEventListener('click', guardLink)
    window.addEventListener('beforeunload', guardUnload)
    return () => {
      document.removeEventListener('click', guardLink)
      window.removeEventListener('beforeunload', guardUnload)
    }
  }, [dirty])

  function review() {
    const contribution = reviewTextTestimonial(eventCode, text)
    if (!contribution) return false
    setStep({ kind: 'review', contribution })
    return true
  }

  function discard() {
    const href = exit?.href
    setExit(null)
    setText('')
    setStep({ kind: 'choose' })
    if (href) {
      confirmedExit.current = true
      window.location.assign(href)
    }
  }

  return (
    <>
      <PublicEventPage code={eventCode} renderEvent={(event, state) => {
        const open = state === 'open'
        if (!open && !dirty) return null

        const identifying = step.kind === 'identify' && open && notice
        return (
          <section className="testimonial">
            <p className="testimonial-event">{event.name}</p>
            <h1 ref={heading} tabIndex={-1}>{!open && step.kind === 'identify' ? titles.review : titles[step.kind]}</h1>
            {!open && <p role="status">{state === 'closed' ? 'O prazo para novos envios terminou.' : 'Novos envios ainda não estão disponíveis.'}</p>}

            {step.kind === 'choose' && open && <button type="button" onClick={() => setStep({ kind: 'write' })}>Escrever depoimento</button>}
            {step.kind === 'write' && <TextTestimonialEditor text={text} onTextChange={setText} onReview={review} />}

            {identifying && step.kind === 'identify' ? (
              <>
                <GuestIdentificationStep eventCode={eventCode} notice={notice} onConfirm={({ identification, remembered }) => {
                  const contribution = identifyTextTestimonial(step.contribution, identification)
                  if (contribution) setStep({ kind: 'identified', contribution, remembered })
                }} />
                <button className="testimonial-secondary" type="button" onClick={() => setStep({ kind: 'review', contribution: step.contribution })}>Voltar à revisão</button>
              </>
            ) : 'contribution' in step && (
              <>
                <section className="testimonial-preview" aria-label="Prévia do depoimento"><p>{step.contribution.text}</p></section>
                {step.kind === 'identified' && <p role="status">Identificação confirmada.{!step.remembered && ' Nome e concordância estão disponíveis apenas nesta página.'}</p>}
                <div className="testimonial-actions">
                  <button className="testimonial-secondary" type="button" onClick={() => setStep({ kind: 'write' })}>Editar texto</button>
                  {open && notice && step.kind === 'review' && (
                    <button type="button" onClick={() => setStep({ kind: 'identify', contribution: step.contribution })}>Confirmar identificação</button>
                  )}
                  <button type="button" disabled>Enviar</button>
                </div>
              </>
            )}

            <div className="testimonial-actions">
              <a href={'/e/' + eventCode}>Voltar ao evento</a>
              {dirty && <button className="testimonial-secondary" type="button" onClick={event => setExit({ href: null, trigger: event.currentTarget })}>Descartar</button>}
            </div>
          </section>
        )
      }} />
      {exit && <DraftDiscardDialog trigger={exit.trigger} onStay={() => setExit(null)} onDiscard={discard} />}
    </>
  )
}
