import { useLayoutEffect, useRef } from 'react'
import type { ContributionCategory } from './guestContribution'
import { MediaCaptionEditor } from './MediaCaptionField'
import { MediaRecordingControls } from './MediaRecordingControls'
import { mediaAccept, type MediaIssue, type MediaKind, type SelectedMedia } from './mediaFiles'
import { releaseMediaElement } from './mediaPreview'
import type { useMediaSelection } from './useMediaSelection'
import type { useMediaRecording } from './useMediaRecording'

const previewError = 'Não foi possível preparar a prévia. Tente novamente ou escolha outro arquivo.'

function limitMessage(category: ContributionCategory, kind: MediaKind) {
  if (kind === 'audio') return 'Este áudio de depoimento deve ter até 5 minutos e 50 MB.'
  if (category === 'moment') return 'Este vídeo de momento deve ter até 1 minuto e 500 MB.'
  return 'Este vídeo de depoimento deve ter até 5 minutos e 500 MB.'
}

function errorMessage(issue: MediaIssue, category: ContributionCategory, kind: MediaKind) {
  switch (issue) {
    case 'size': case 'duration': return limitMessage(category, kind)
    case 'empty': return 'O arquivo está vazio.'
    case 'format': return kind === 'video' ? 'Selecione um vídeo MP4, MOV ou WebM.' : 'Selecione um áudio MP3, M4A, WAV, OGG ou WebM.'
    case 'metadata': return 'Não foi possível verificar a duração. Escolha outro arquivo.'
    case 'preview': return previewError
  }
}

export function ContributionMediaPreview({ media, failed, onFailure, onRetry }: {
  media: SelectedMedia
  failed: boolean
  onFailure: () => void
  onRetry: () => void
}) {
  const player = useRef<HTMLVideoElement | HTMLAudioElement | null>(null)
  const url = media.url
  useLayoutEffect(() => {
    const element = player.current
    if (!element || failed) return
    element.src = url
    return () => releaseMediaElement(element)
  }, [url, failed])

  if (failed) {
    return <>
      <p role="alert" className="testimonial-error">{previewError}</p>
      <button className="testimonial-secondary" type="button" onClick={onRetry}>Tentar novamente</button>
    </>
  }
  return media.kind === 'video' ? (
    <video ref={element => { player.current = element }} aria-label="Prévia do vídeo" className="contribution-player" controls playsInline preload="metadata" onError={onFailure} />
  ) : (
    <audio ref={element => { player.current = element }} aria-label="Prévia do áudio" className="contribution-player" controls preload="metadata" onError={onFailure} />
  )
}

export function MediaFileEditor({ category, kind, selection, recording, open, caption, onCaption, onReview }: {
  category: ContributionCategory
  kind: MediaKind
  selection: ReturnType<typeof useMediaSelection>
  recording: ReturnType<typeof useMediaRecording>
  open: boolean
  caption: string | null
  onCaption: (value: string | null) => void
  onReview: () => void
}) {
  const { selected, issue, busy, previewFailed, select, clear, keepSelection, setPreviewFailed } = selection
  const word = kind === 'video' ? 'vídeo' : 'áudio'
  const limit = limitMessage(category, kind)
  const cancelRecording = recording.cancel

  useLayoutEffect(() => () => cancelRecording(), [cancelRecording])
  useLayoutEffect(() => {
    if (!open) cancelRecording()
  }, [open, cancelRecording])

  return (
    <div className="photo-editor">
      <p>{limit}</p>
      {open && <MediaRecordingControls kind={kind} recording={recording} selected={!!selected} busy={busy} limit={limit} />}
      {open && (
        <label className="photo-picker">{selected ? 'Trocar ' : 'Selecionar '}{word}
          <input type="file" accept={mediaAccept[kind]} disabled={busy} onClick={cancelRecording} onChange={event => {
            const input = event.currentTarget
            const file = input.files?.[0]
            input.value = ''
            cancelRecording()
            void select(file, kind)
          }} />
        </label>
      )}
      {busy && !recording.active && <p role="status">Preparando prévia…</p>}
      {issue && !recording.active && (
        <div role="alert" className="testimonial-error">
          <p><b>{issue.name}</b> {errorMessage(issue.code, category, kind)}</p>
          {selected && <button className="testimonial-secondary" type="button" onClick={keepSelection}>Manter arquivo anterior</button>}
        </div>
      )}
      {selected && !recording.active && (
        <>
          {!busy && <ContributionMediaPreview media={selected} failed={previewFailed} onFailure={() => setPreviewFailed(true)} onRetry={() => setPreviewFailed(false)} />}
          <button className="testimonial-secondary" type="button" disabled={busy} onClick={clear}>Remover {word}</button>
          <MediaCaptionEditor label={'Legenda do ' + word} caption={caption} onChange={onCaption} />
        </>
      )}
      <button type="button" disabled={!selected || !!issue || busy || previewFailed || recording.active} onClick={onReview}>Revisar</button>
    </div>
  )
}
