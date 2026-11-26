import type { PhotoCategory } from './photoSubmissionService'
import type { PhotoSubmissionView } from './usePhotoSubmission'
import type { MediaUploadFormat } from './mediaSubmissionService'
import type { MediaSubmissionView } from './useMediaSubmission'

const brasilia = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

function PhotoPositions({ positions, label }: { positions: readonly number[] | undefined; label: string }) {
  if (!positions?.length) return null
  return (
    <div>
      <p>{label}</p>
      <ul>{positions.map(position => <li key={position}>Foto {position}</li>)}</ul>
    </div>
  )
}

export function SubmissionProgress({ view, category, format = 'photo', onRetry }: {
  view: PhotoSubmissionView | MediaSubmissionView
  category: PhotoCategory
  format?: 'photo' | MediaUploadFormat
  onRetry: () => void
}) {
  const subject = { audio: 'o áudio', video: 'o vídeo', photo: category === 'moment' ? 'o conjunto de fotos' : 'a foto' }[format]
  const transfer = {
    audio: 'Transferência do áudio',
    video: 'Transferência do vídeo',
    photo: category === 'moment' ? 'Transferência do conjunto de fotos' : 'Transferência da foto',
  }[format]
  const plural = { audio: 'áudios', video: 'vídeos', photo: 'fotos' }[format]
  const receiving = { audio: 'do áudio', video: 'do vídeo', photo: 'do conjunto de fotos' }[format]
  switch (view.kind) {
    case 'preparing':
      return <p role="status">Preparando {subject} para envio.</p>
    case 'checking':
      return <p role="status">Estamos verificando o estado do envio.</p>
    case 'transferring': {
      const percent = Math.floor(100 * view.loaded / view.total)
      return (
        <div className="submission-progress">
          <p role="status">Transferindo {subject}.</p>
          <label htmlFor="submission-transfer">{transfer}</label>
          <progress id="submission-transfer" value={view.loaded} max={view.total} /> <span>{percent}%</span>
          {view.completionDeadlineAt && <p>Prazo para transferir {subject} até <time dateTime={view.completionDeadlineAt}>
            {brasilia.format(new Date(view.completionDeadlineAt))}
          </time> (horário de Brasília).</p>}
        </div>
      )
    }
    case 'validating':
      return <p role="status">Validando {subject}. Aguarde a confirmação do recebimento.</p>
    case 'awaiting-receipt':
    case 'interrupted':
    case 'paused':
      return (
        <>
          <p role="status">{{
            paused: 'O envio de ' + plural + ' está temporariamente indisponível. Estamos verificando o estado do envio.',
            interrupted: 'O envio foi interrompido. Tente novamente.',
            'awaiting-receipt': 'Estamos verificando o recebimento ' + receiving + '.',
          }[view.kind]}</p>
          {'pendingPositions' in view && <PhotoPositions positions={view.pendingPositions} label="Fotos a transferir" />}
          <button type="button" onClick={onRetry} disabled={!view.canRetry}>Tentar novamente</button>
        </>
      )
    case 'reconciling':
      return <p role="status">O prazo para concluir este envio terminou. Estamos verificando o estado do envio.</p>
    case 'expired':
      return (
        <div role="alert" className="testimonial-error">
          {format === 'photo' && category === 'moment' && <p>O conjunto não foi enviado. Confira os arquivos indicados.</p>}
          <p>O prazo para concluir este envio terminou.</p>
          {'problemPositions' in view && <PhotoPositions positions={view.problemPositions} label="Fotos cujo recebimento ficou pendente" />}
        </div>
      )
    default:
      return null
  }
}
