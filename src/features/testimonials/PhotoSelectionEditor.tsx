import type { ChangeEvent, ReactNode } from 'react'
import { useLayoutEffect, useRef } from 'react'
import { MediaCaptionEditor } from './MediaCaptionField'
import { photoAccept, type PhotoIssue, type SelectedPhoto } from './photoFiles'
import type { usePhotoSelection } from './usePhotoSelection'
import { usePhotoCamera } from './usePhotoCamera'

function issueMessage(issue: PhotoIssue, maximum: number) {
  switch (issue) {
    case 'empty': return 'O arquivo está vazio.'
    case 'size': return 'Cada foto deve ter até 20 MB.'
    case 'format': return 'Selecione uma foto JPEG, PNG ou HEIC/HEIF.'
    case 'preview': return 'Não foi possível exibir a prévia desta foto. Troque o arquivo ou escolha outra foto.'
    case 'quantity': return maximum === 1 ? 'O depoimento aceita uma foto.' : 'O momento aceita até dez fotos.'
  }
}

export function PhotoThumbnails({ photos, controls }: { photos: readonly SelectedPhoto[]; controls?: (photo: SelectedPhoto, index: number) => ReactNode }) {
  return (
    <ol className="photo-thumbnails">
      {photos.map((photo, index) => (
        <li key={photo.id}>
          <img src={photo.url} alt={'Foto ' + (index + 1)} decoding="async" />
          {controls?.(photo, index)}
        </li>
      ))}
    </ol>
  )
}

export function PhotoSelectionEditor({ selection, maximum, open, paused, caption, onCaption, onReview }: {
  selection: ReturnType<typeof usePhotoSelection>
  maximum: number
  open: boolean
  paused: boolean
  caption: string | null
  onCaption: (value: string | null) => void
  onReview: () => void
}) {
  const { photos, rejected, busy, select, remove, dismissRejected } = selection
  const camera = usePhotoCamera(open && !paused, select)
  const previewReady = camera.view.kind === 'live' && camera.view.ready
  const cameraActive = camera.view.kind === 'requesting' || camera.view.kind === 'live' || camera.view.kind === 'capturing'
  const shutter = useRef<HTMLButtonElement>(null)

  useLayoutEffect(() => {
    if (previewReady) shutter.current?.focus()
  }, [previewReady])

  function choose(event: ChangeEvent<HTMLInputElement>, replacement?: SelectedPhoto) {
    const input = event.currentTarget
    const files = Array.from(input.files ?? [])
    input.value = ''
    camera.cancel()
    void select(files, replacement)
  }

  return (
    <div className="photo-editor">
      <p>{maximum === 1 ? 'Adicione uma foto de até 20 MB.' : 'Adicione até dez fotos de até 20 MB cada.'}</p>
      {open && (
        <>
          <button type="button" disabled={busy || cameraActive || photos.length >= maximum} onClick={() => void camera.start()}>Fotografar</button>
          {camera.view.kind === 'requesting' && <p role="status">Aguardando permissão da câmera…</p>}
          {camera.view.kind === 'capturing' && <p role="status">Preparando foto…</p>}
          {camera.view.kind === 'live' && (
            <div className="photo-camera">
              <video ref={camera.video} muted playsInline aria-label="Prévia da câmera" />
              {!previewReady && <p role="status">Abrindo a prévia da câmera…</p>}
              <button type="button" ref={shutter} disabled={!previewReady} onClick={() => void camera.capture()}>Tirar foto</button>
            </div>
          )}
          {cameraActive && <button className="testimonial-secondary" type="button" onClick={camera.cancel}>Fechar câmera</button>}
          {camera.view.kind === 'failed' && (
            <p className="testimonial-error" role="alert">{camera.view.failure === 'unavailable'
              ? 'Permita o acesso no navegador ou selecione um arquivo do dispositivo.'
              : 'Não foi possível preparar a prévia. Tente novamente ou escolha outro arquivo.'}</p>
          )}
          <label className="photo-picker">Selecionar fotos
            <input type="file" accept={photoAccept} multiple={maximum > 1} disabled={busy || photos.length >= maximum}
              onClick={camera.cancel} onChange={choose} />
          </label>
        </>
      )}
      {busy && <p role="status">Preparando prévias…</p>}
      {rejected.length > 0 && (
        <div role="alert" className="testimonial-error">
          <ul>{rejected.map(({ name, issue }, index) => <li key={index}><b>{name}</b> {issueMessage(issue, maximum)}</li>)}</ul>
          <button className="testimonial-secondary" type="button" onClick={dismissRejected} disabled={busy}>Descartar arquivos rejeitados</button>
        </div>
      )}
      {photos.length > 0 && (
        <>
          <PhotoThumbnails photos={photos} controls={(photo, index) => (
            <>
              {open && (
                <>
                  <button className="testimonial-secondary" type="button" disabled={busy || cameraActive}
                    onClick={() => void camera.start(photo)}>Refazer foto {index + 1}</button>
                  <label className="photo-picker">Trocar foto {index + 1}
                    <input type="file" accept={photoAccept} disabled={busy} onClick={camera.cancel} onChange={event => choose(event, photo)} />
                  </label>
                </>
              )}
              <button className="testimonial-secondary" type="button" disabled={busy || cameraActive} onClick={() => remove(photo)}>Remover foto {index + 1}</button>
            </>
          )} />
          <MediaCaptionEditor label="Legenda das fotos" caption={caption} onChange={onCaption} />
        </>
      )}
      <button type="button" disabled={photos.length === 0 || rejected.length > 0 || busy || camera.view.kind === 'capturing'} onClick={onReview}>Revisar</button>
    </div>
  )
}
