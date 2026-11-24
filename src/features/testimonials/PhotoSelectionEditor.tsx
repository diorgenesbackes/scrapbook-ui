import type { ChangeEvent, ReactNode } from 'react'
import { MediaCaptionEditor } from './MediaCaptionField'
import { photoAccept, type PhotoIssue, type SelectedPhoto } from './photoFiles'
import type { usePhotoSelection } from './usePhotoSelection'

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

export function PhotoSelectionEditor({ selection, maximum, open, caption, onCaption, onReview }: {
  selection: ReturnType<typeof usePhotoSelection>
  maximum: number
  open: boolean
  caption: string | null
  onCaption: (value: string | null) => void
  onReview: () => void
}) {
  const { photos, rejected, busy, select, remove, dismissRejected } = selection

  function choose(event: ChangeEvent<HTMLInputElement>, replacement?: SelectedPhoto) {
    const input = event.currentTarget
    const files = Array.from(input.files ?? [])
    input.value = ''
    void select(files, replacement)
  }

  return (
    <div className="photo-editor">
      <p>{maximum === 1 ? 'Selecione uma foto de até 20 MB.' : 'Selecione até dez fotos de até 20 MB cada.'}</p>
      {open && (
        <label className="photo-picker">Selecionar fotos
          <input type="file" accept={photoAccept} multiple={maximum > 1} disabled={busy || photos.length >= maximum} onChange={choose} />
        </label>
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
              {open && <label className="photo-picker">Trocar foto {index + 1}
                <input type="file" accept={photoAccept} disabled={busy} onChange={event => choose(event, photo)} />
              </label>}
              <button className="testimonial-secondary" type="button" disabled={busy} onClick={() => remove(photo)}>Remover foto {index + 1}</button>
            </>
          )} />
          <MediaCaptionEditor label="Legenda das fotos" caption={caption} onChange={onCaption} />
        </>
      )}
      <button type="button" disabled={photos.length === 0 || rejected.length > 0 || busy} onClick={onReview}>Revisar</button>
    </div>
  )
}
