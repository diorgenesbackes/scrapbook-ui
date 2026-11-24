import { useState } from 'react'
import { PublicEventPage } from '../public-event/PublicEventPage'
import type { GuestAccessNotice } from './GuestIdentificationForm'
import { GuestIdentificationStep } from './GuestIdentificationStep'

const localNotice: GuestAccessNotice = {
  code: 'f06-local-v1',
  body: 'Apenas os responsáveis pelo evento podem acessar as contribuições, conforme a política do evento.',
}

export function GuestIdentificationPreview({ eventCode, category }: {
  eventCode: string
  category: 'depoimento' | 'momento' | undefined
}) {
  const [draft, setDraft] = useState('')
  const [result, setResult] = useState<'remembered' | 'current-page' | null>(null)

  return (
    <PublicEventPage code={eventCode} renderOpenEvent={event => (
      <>
        <p>{event.name}</p>
        <h1>Identificação</h1>
        {category && (
          <div className="guest-identification-draft">
            <p>{category === 'depoimento' ? 'Prévia de depoimento' : 'Prévia de momento'}</p>
            <label htmlFor="guest-identification-draft">Rascunho de teste</label>
            <textarea id="guest-identification-draft" value={draft} onChange={event => setDraft(event.currentTarget.value)} />
          </div>
        )}
        {result ? (
          <p role="status" tabIndex={-1} ref={element => { element?.focus() }}>
            Identificação confirmada.{result === 'current-page' && ' Nome e concordância estão disponíveis apenas nesta página.'}
          </p>
        ) : (
          <GuestIdentificationStep eventCode={eventCode} notice={localNotice}
            onConfirm={({ remembered }) => setResult(remembered ? 'remembered' : 'current-page')} />
        )}
        <p><a href={'/e/' + eventCode}>Voltar ao evento</a></p>
      </>
    )} />
  )
}
