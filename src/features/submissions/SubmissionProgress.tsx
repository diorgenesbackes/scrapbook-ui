import type { PhotoSubmissionView } from './usePhotoSubmission'

const brasilia = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

export function SubmissionProgress({ view, onRetry }: { view: PhotoSubmissionView; onRetry: () => void }) {
  switch (view.kind) {
    case 'preparing':
      return <p role="status">Preparando a foto para envio.</p>
    case 'checking':
      return <p role="status">Estamos verificando o estado do envio.</p>
    case 'transferring': {
      const percent = Math.floor(100 * view.loaded / view.total)
      return (
        <div className="submission-progress">
          <p role="status">Transferindo a foto.</p>
          <label htmlFor="photo-transfer">Transferência da foto</label>
          <progress id="photo-transfer" value={view.loaded} max={view.total} /> <span>{percent}%</span>
          {view.completionDeadlineAt && <p>Prazo para transferir a foto até <time dateTime={view.completionDeadlineAt}>
            {brasilia.format(new Date(view.completionDeadlineAt))}
          </time> (horário de Brasília).</p>}
        </div>
      )
    }
    case 'validating':
      return <p role="status">Validando a foto. Aguarde a confirmação do recebimento.</p>
    case 'interrupted':
      return (
        <>
          <p role="status">O envio foi interrompido. Tente novamente.</p>
          <button type="button" onClick={onRetry} disabled={!view.canRetry}>Tentar novamente</button>
        </>
      )
    case 'reconciling':
      return <p role="status">O prazo para concluir este envio terminou. Estamos verificando o estado do envio.</p>
    case 'expired':
      return <p role="alert" className="testimonial-error">O prazo para concluir este envio terminou.</p>
    default:
      return null
  }
}
