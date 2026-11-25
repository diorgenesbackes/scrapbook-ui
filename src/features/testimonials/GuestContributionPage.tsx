import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { environment } from '../../config/environment'
import type { GuestAccessNotice, GuestIdentification } from '../guest-identification/GuestIdentificationForm'
import { GuestIdentificationStep, type GuestIdentificationConfirmation } from '../guest-identification/GuestIdentificationStep'
import { PublicEventPage } from '../public-event/PublicEventPage'
import { photoSubmissionDisabledCode, photoSubmissionUnavailableMessage } from '../submissions/photoSubmissionService'
import { SubmissionIdentification } from '../submissions/SubmissionIdentification'
import { SubmissionProgress } from '../submissions/SubmissionProgress'
import { SubmissionReceipt } from '../submissions/SubmissionReceipt'
import { usePhotoSubmission } from '../submissions/usePhotoSubmission'
import { useTextSubmission } from '../submissions/useTextSubmission'
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
  | { kind: 'identified'; contribution: ReviewedContribution & { identification: GuestIdentification }; remembered: boolean; proof: string | null }

function canSubmit(contribution: ReviewedContribution) {
  return contribution.format === 'text' || (contribution.format === 'photo' && !!environment.submissionUploadOrigin)
}

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
  const releaseConfirmedDraft = useCallback(() => {
    setText('')
    setStep({ kind: 'choose' })
  }, [])
  const clearPhotos = selection.clear
  const releaseConfirmedPhoto = useCallback(() => {
    clearPhotos()
    setCaption(null)
    setExit(null)
    setStep({ kind: 'choose' })
  }, [clearPhotos])
  const photoSubmission = usePhotoSubmission(eventCode, releaseConfirmedPhoto)
  const photoView = photoSubmission.view
  const photoInProgress = photoView.kind !== 'idle' && photoView.kind !== 'confirmed' && photoView.kind !== 'error'
  const submission = useTextSubmission(eventCode, releaseConfirmedDraft)
  const submittingText = submission.view.kind === 'sending' || submission.view.kind === 'checking' || submission.view.kind === 'unknown'
  const dirty = text.length > 0 || (caption?.length ?? 0) > 0 || selection.photos.length > 0 || selection.busy || !!media.selected || media.busy || recording.active

  useLayoutEffect(() => {
    heading.current?.focus()
  }, [step.kind, submittingText, photoInProgress])

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
    submission.reset()
    photoSubmission.reset()
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
    submission.reset()
    photoSubmission.reset()
    setStep({ kind: 'choose' })
    if (href) {
      confirmedExit.current = true
      window.location.assign(href)
    }
  }

  function send() {
    if (step.kind !== 'identified' || !step.proof) return
    const { contribution } = step
    const { guestName, noticeCode } = contribution.identification
    const identification = { guestName, noticeCode, consentProof: step.proof }
    if (contribution.format === 'text') {
      submission.send({ category: 'testimonial', format: 'text', text: contribution.text, identification })
    } else if (contribution.format === 'photo' && environment.submissionUploadOrigin
      && (photoView.kind !== 'error' || photoView.code !== photoSubmissionDisabledCode)) {
      photoSubmission.send({
        category: contribution.category,
        files: contribution.photos.map(({ file, format }) => ({ file, declaredMediaType: 'image/' + format })),
        caption: contribution.caption,
        identification,
      })
    }
  }

  function discardButton() {
    return <button className="testimonial-secondary" type="button"
      onClick={event => setExit({ href: null, trigger: event.currentTarget })}>Descartar</button>
  }

  function photoProgress(eventName?: string, windowMessage?: string) {
    return (
      <section className="testimonial">
        {eventName && <p className="testimonial-event">{eventName}</p>}
        <h1 ref={heading} tabIndex={-1}>{category === 'moment' ? 'Envio do momento' : 'Envio do depoimento'}</h1>
        {windowMessage && <p role="status">{windowMessage}</p>}
        <SubmissionProgress view={photoView} category={category} onRetry={photoSubmission.retry} />
        <div className="testimonial-actions">
          <a href={'/e/' + eventCode}>Voltar ao evento</a>
          {dirty && discardButton()}
        </div>
      </section>
    )
  }

  function photoReceipt(confirmedAt: string, open: boolean) {
    return <SubmissionReceipt eventCode={eventCode} confirmedAt={confirmedAt} open={open} category={category} onRestart={photoSubmission.reset} />
  }

  const renderPendingPhoto = photoView.kind === 'confirmed' ? () => photoReceipt(photoView.confirmedAt, false)
    : photoInProgress ? () => photoProgress() : undefined

  return (
    <>
      <PublicEventPage code={eventCode} renderPending={renderPendingPhoto} renderEvent={(event, state) => {
        const open = state === 'open'
        const windowMessage = open ? undefined : state === 'closed'
          ? 'O prazo para novos envios terminou.' : 'Novos envios ainda não estão disponíveis.'
        if (photoView.kind === 'confirmed') return photoReceipt(photoView.confirmedAt, open)
        if (photoInProgress) return photoProgress(event.name, windowMessage)
        if (submission.view.kind === 'confirmed') {
          return <SubmissionReceipt eventCode={eventCode} confirmedAt={submission.view.confirmedAt} open={open} onRestart={submission.reset} />
        }
        if (!open && !dirty) return null

        function identify(contribution: ReviewedContribution, value: GuestIdentificationConfirmation, proof: string | null) {
          const identified = identifyContribution(contribution, value.identification)
          if (identified) setStep({ kind: 'identified', contribution: identified, remembered: value.remembered, proof })
        }

        const identifying = step.kind === 'identify' && open && (canSubmit(step.contribution) || notice)
        const view = 'contribution' in step && step.contribution.format === 'photo' ? photoView : submission.view
        const error = view.kind === 'error' ? view : null
        const renew = error?.code === 'SUBMISSION_CONSENT_REQUIRED'
        return (
          <section className="testimonial">
            <p className="testimonial-event">{event.name}</p>
            <h1 ref={heading} tabIndex={-1}>{submittingText ? 'Envio do depoimento' : title(step, open, category)}</h1>
            {windowMessage && <p role="status">{windowMessage}</p>}

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
                {canSubmit(step.contribution)
                  ? <SubmissionIdentification eventCode={eventCode} fallback={notice}
                    onConfirm={(value, proof) => identify(step.contribution, value, proof)} />
                  : notice && <GuestIdentificationStep eventCode={eventCode} notice={notice}
                    onConfirm={value => identify(step.contribution, value, null)} />}
                <button className="testimonial-secondary" type="button" onClick={() => setStep({ kind: 'review', contribution: step.contribution })}>Voltar à revisão</button>
              </>
            ) : submittingText ? (
              <>
                <p role="status">{submission.view.kind === 'sending'
                  ? 'Enviando o depoimento para validação.' : 'Estamos verificando o estado do envio.'}</p>
                {submission.view.kind === 'unknown' && (
                  <>
                    <p>O envio foi interrompido. Tente novamente.</p>
                    <button type="button" onClick={submission.retry}>Tentar novamente</button>
                  </>
                )}
              </>
            ) : 'contribution' in step && (
              <>
                {step.contribution.format === 'text' ? (
                  <section className="testimonial-preview" aria-label="Prévia do depoimento"><p>{step.contribution.text}</p></section>
                ) : step.contribution.format === 'photo' ? (
                  <section className="testimonial-preview" aria-label="Prévia das fotos">
                    <PhotoThumbnails photos={selection.photos} controls={(_, index) => (
                      photoView.kind === 'error' && photoView.problemPositions?.includes(index + 1)
                        ? <p className="testimonial-error">Foto {index + 1}. {photoView.problemMessage}</p> : null
                    )} />
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
                {error && <p role="alert" className="testimonial-error">{error.message}</p>}
                {step.contribution.format === 'photo' && !environment.submissionUploadOrigin && <p role="status">{photoSubmissionUnavailableMessage}</p>}
                <div className="testimonial-actions">
                  <button className="testimonial-secondary" type="button" onClick={() => edit(step.contribution.format)}>
                    {{ text: 'Editar texto', photo: 'Editar fotos e legenda', video: 'Editar vídeo e legenda', audio: 'Editar áudio e legenda' }[step.contribution.format]}
                  </button>
                  {open && (notice || canSubmit(step.contribution)) && (step.kind === 'review' || renew) && !media.previewFailed && (
                    <button type="button" onClick={() => {
                      submission.reset()
                      photoSubmission.reset()
                      setStep({ kind: 'identify', contribution: step.contribution })
                    }}>Confirmar identificação</button>
                  )}
                  <button type="button" disabled={!open || renew || error?.code === 'PHOTO_REJECTED' || error?.code === photoSubmissionDisabledCode
                    || step.kind !== 'identified' || !step.proof || !canSubmit(step.contribution)} onClick={send}>Enviar</button>
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
              {dirty && discardButton()}
            </div>
          </section>
        )
      }} />
      {exit && <DraftDiscardDialog trigger={exit.trigger} onStay={() => setExit(null)} onDiscard={discard} />}
    </>
  )
}
