import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { GuestAccessNotice, GuestIdentification } from '../guest-identification/GuestIdentificationForm'
import { GuestIdentificationStep } from '../guest-identification/GuestIdentificationStep'
import { PublicEventPage } from '../public-event/PublicEventPage'
import { DraftDiscardDialog } from './DraftDiscardDialog'
import { identifyContribution, type ContributionCategory } from './guestContribution'
import { ContributionMediaPreview, MediaFileEditor } from './MediaFileEditor'
import { reviewMedia, type MediaKind, type ReviewedMedia } from './mediaFiles'
import { photoCountLimit, reviewPhotos, type ReviewedPhotos } from './photoFiles'
import { PhotoSelectionEditor, PhotoThumbnails } from './PhotoSelectionEditor'
import { TextTestimonialEditor } from './TextTestimonialEditor'
import { reviewTextTestimonial, type ReviewedTextTestimonial } from './testimonialText'
import { usePhotoSelection } from './usePhotoSelection'
import { useMediaSelection } from './useMediaSelection'
import { useMediaRecording } from './useMediaRecording'
import './testimonials.css'

type ReviewedContribution = ReviewedTextTestimonial | ReviewedPhotos | ReviewedMedia

type Step =
  | { kind: 'choose' | 'write' | 'photos' }
  | { kind: 'media'; media: MediaKind }
  | { kind: 'review' | 'identify'; contribution: ReviewedContribution }
  | { kind: 'identified'; contribution: ReviewedContribution & { identification: GuestIdentification }; remembered: boolean }

type PendingExit = { href: string | null; trigger: HTMLElement | null }

function title(step: Step, open: boolean, category: ContributionCategory): string {
  if (step.kind === 'choose') return category === 'testimonial' ? 'Deixe um depoimento' : 'Registre um momento'
  if (step.kind === 'write') return 'Escrever depoimento'
  if (step.kind === 'photos') return 'Selecionar fotos'
  if (step.kind === 'media') return step.media === 'video' ? 'Gravar ou selecionar vídeo' : 'Gravar ou selecionar áudio'
  if (step.kind === 'identify' && open) return 'Identificação'
  return category === 'testimonial' ? 'Revisar depoimento' : 'Revisar momento'
}

export function GuestContributionPage({ eventCode, category, notice }: { eventCode: string; category: ContributionCategory; notice?: GuestAccessNotice }) {
  const [text, setText] = useState('')
  const [caption, setCaption] = useState<string | null>(null)
  const [step, setStep] = useState<Step>({ kind: 'choose' })
  const [exit, setExit] = useState<PendingExit | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const confirmedExit = useRef(false)
  const maximum = photoCountLimit(category)
  const selection = usePhotoSelection(maximum)
  const media = useMediaSelection(category)
  const recording = useMediaRecording(category, async (file, kind, signal) => {
    const selected = await media.select(file, kind, signal)
    if (!selected || signal.aborted) return
    const contribution = reviewMedia(eventCode, category, selected, caption)
    if (contribution) setStep({ kind: 'review', contribution })
  })
  const dirty = text.length > 0 || (caption?.length ?? 0) > 0 || selection.photos.length > 0 || selection.busy || !!media.selected || media.busy || recording.active

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

  function reviewSelectedPhotos() {
    if (selection.busy || selection.rejected.length) return
    const contribution = reviewPhotos(eventCode, category, selection.photos, caption)
    if (contribution) setStep({ kind: 'review', contribution })
  }

  function reviewSelectedMedia() {
    if (!media.selected || media.issue || media.busy || media.previewFailed) return
    const contribution = reviewMedia(eventCode, category, media.selected, caption)
    if (contribution) setStep({ kind: 'review', contribution })
  }

  function edit(format: ReviewedContribution['format']) {
    if (format === 'text') setStep({ kind: 'write' })
    else if (format === 'photo') setStep({ kind: 'photos' })
    else setStep({ kind: 'media', media: format })
  }

  function discard() {
    const href = exit?.href
    setExit(null)
    setText('')
    setCaption(null)
    selection.clear()
    recording.cancel()
    media.clear()
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
            <h1 ref={heading} tabIndex={-1}>{title(step, open, category)}</h1>
            {!open && <p role="status">{state === 'closed' ? 'O prazo para novos envios terminou.' : 'Novos envios ainda não estão disponíveis.'}</p>}

            {step.kind === 'choose' && open && (
              <div className="testimonial-actions">
                {category === 'testimonial' && <button type="button" onClick={() => setStep({ kind: 'write' })}>Escrever depoimento</button>}
                <button type="button" onClick={() => setStep({ kind: 'photos' })}>Selecionar fotos</button>
                <button type="button" onClick={() => setStep({ kind: 'media', media: 'video' })}>Selecionar vídeo</button>
                {category === 'testimonial' && <button type="button" onClick={() => setStep({ kind: 'media', media: 'audio' })}>Selecionar áudio</button>}
              </div>
            )}
            {step.kind === 'write' && <TextTestimonialEditor text={text} onTextChange={setText} onReview={review} />}
            {step.kind === 'photos' && (
              <PhotoSelectionEditor selection={selection} maximum={maximum} open={open} paused={exit !== null} caption={caption} onCaption={setCaption}
                onReview={reviewSelectedPhotos} />
            )}
            {step.kind === 'media' && (
              <MediaFileEditor category={category} kind={step.media} selection={media} recording={recording} open={open} caption={caption} onCaption={setCaption}
                onReview={reviewSelectedMedia} />
            )}

            {identifying && step.kind === 'identify' ? (
              <>
                <GuestIdentificationStep eventCode={eventCode} notice={notice} onConfirm={({ identification, remembered }) => {
                  const contribution = identifyContribution(step.contribution, identification)
                  if (contribution) setStep({ kind: 'identified', contribution, remembered })
                }} />
                <button className="testimonial-secondary" type="button" onClick={() => setStep({ kind: 'review', contribution: step.contribution })}>Voltar à revisão</button>
              </>
            ) : 'contribution' in step && (
              <>
                {step.contribution.format === 'text' ? (
                  <section className="testimonial-preview" aria-label="Prévia do depoimento"><p>{step.contribution.text}</p></section>
                ) : step.contribution.format === 'photo' ? (
                  <section className="testimonial-preview" aria-label="Prévia das fotos">
                    <PhotoThumbnails photos={selection.photos} />
                    {step.contribution.caption && <p>{step.contribution.caption}</p>}
                  </section>
                ) : media.selected && (
                  <section className="testimonial-preview" aria-label="Prévia da mídia">
                    <ContributionMediaPreview media={media.selected} failed={media.previewFailed} onFailure={() => media.setPreviewFailed(true)}
                      onRetry={() => media.setPreviewFailed(false)} />
                    {step.contribution.caption && <p>{step.contribution.caption}</p>}
                  </section>
                )}
                {step.kind === 'identified' && <p role="status">Identificação confirmada.{!step.remembered && ' Nome e concordância estão disponíveis apenas nesta página.'}</p>}
                <div className="testimonial-actions">
                  <button className="testimonial-secondary" type="button" onClick={() => edit(step.contribution.format)}>
                    {{ text: 'Editar texto', photo: 'Editar fotos e legenda', video: 'Editar vídeo e legenda', audio: 'Editar áudio e legenda' }[step.contribution.format]}
                  </button>
                  {open && notice && step.kind === 'review' && !media.previewFailed && (
                    <button type="button" onClick={() => setStep({ kind: 'identify', contribution: step.contribution })}>Confirmar identificação</button>
                  )}
                  <button type="button" disabled>Enviar</button>
                </div>
              </>
            )}

            <div className="testimonial-actions">
              {(step.kind === 'photos' || step.kind === 'media') && open && (
                <button className="testimonial-secondary" type="button" onClick={event => {
                  if (dirty) setExit({ href: null, trigger: event.currentTarget })
                  else setStep({ kind: 'choose' })
                }}>Voltar aos formatos</button>
              )}
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
