import { useEffect, useRef, useState, type FormEvent } from 'react'
import { withCivilSeconds } from './eventDates'
import { getEvent, replaceEventDetails, type EventDetail } from './eventService'
import { WelcomeMessageField } from './WelcomeMessageField'

type Status =
  | { kind: 'idle' | 'busy' | 'saved' | 'conflict' | 'load-version' | 'failed' }
  | { kind: 'invalid'; fields: string[] }

function draftFrom(event: EventDetail) {
  return { name: event.name, startsAt: event.startsAt,
    welcomeMessage: event.usesDefaultWelcomeMessage ? null : event.welcomeMessage }
}

export function EventDetailsForm({ event, onUpdated, onLocked, onAccessLost }: {
  event: EventDetail
  onUpdated: (event: EventDetail) => void
  onLocked: () => void
  onAccessLost: (kind: 'expired' | 'not-found') => void
}) {
  const [draft, setDraft] = useState(() => draftFrom(event))
  const [expectedVersion, setExpectedVersion] = useState(event.version)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const pending = useRef<AbortController | null>(null)
  useEffect(() => () => pending.current?.abort(), [])

  async function refreshVersion(signal: AbortSignal) {
    const current = await getEvent(event.id, signal)
    if (signal.aborted) return
    if (current.kind === 'ready') {
      setExpectedVersion(current.data.version)
      onUpdated(current.data)
      setStatus({ kind: 'conflict' })
    } else if (current.kind === 'expired' || current.kind === 'not-found') {
      onAccessLost(current.kind)
    } else {
      setStatus({ kind: 'load-version' })
    }
  }

  async function run(operation: (signal: AbortSignal) => Promise<void>) {
    if (pending.current) return
    const controller = new AbortController()
    pending.current = controller
    setStatus({ kind: 'busy' })
    try {
      await operation(controller.signal)
    } finally {
      if (pending.current === controller) pending.current = null
    }
  }

  function submit(form: FormEvent<HTMLFormElement>) {
    form.preventDefault()
    if (locked || status.kind === 'load-version') return
    void run(async signal => {
      const result = await replaceEventDetails(event.id, { ...draft, startsAt: withCivilSeconds(draft.startsAt) },
        expectedVersion, signal)
      if (signal.aborted) return
      if (result.kind === 'ready') {
        setDraft(draftFrom(result.data))
        setExpectedVersion(result.data.version)
        onUpdated(result.data)
        setStatus({ kind: 'saved' })
      } else if (result.kind === 'conflict' || result.kind === 'locked') {
        if (result.kind === 'locked') onLocked()
        await refreshVersion(signal)
      } else if (result.kind === 'expired' || result.kind === 'not-found') {
        onAccessLost(result.kind)
      } else {
        setStatus(result.kind === 'invalid' ? result : { kind: 'failed' })
      }
    })
  }

  const locked = !event.canEditDetails
  const nameInvalid = status.kind === 'invalid' && status.fields.includes('name')
  const startInvalid = status.kind === 'invalid' && status.fields.includes('startsAt')

  return (
    <section aria-labelledby="details-title">
      <h2 id="details-title">Informações do evento</h2>
      {locked && <p role="status">As informações deste evento estão travadas.</p>}
      {!locked && (
        <form className="event-form" onSubmit={submit} aria-busy={status.kind === 'busy'}>
          <fieldset disabled={status.kind === 'busy'}>
            <legend>Editar informações</legend>
            <label htmlFor="details-name">Nome do evento</label>
            <input id="details-name" value={draft.name} required aria-invalid={nameInvalid}
              aria-describedby={nameInvalid ? 'details-name-error' : undefined}
              onChange={change => setDraft({ ...draft, name: change.target.value })} />
            {nameInvalid && <p id="details-name-error">Informe de 1 a 120 caracteres úteis.</p>}
            <label htmlFor="details-start">Data e horário do evento (Brasília)</label>
            <input id="details-start" type="datetime-local" step={1} value={draft.startsAt} required
              aria-invalid={startInvalid} aria-describedby={startInvalid ? 'details-start-error' : undefined}
              onChange={change => setDraft({ ...draft, startsAt: change.target.value })} />
            {startInvalid && <p id="details-start-error">Informe uma data e um horário válidos. Os envios devem encerrar antes da abertura programada.</p>}
            <WelcomeMessageField value={draft.welcomeMessage} onChange={welcomeMessage => setDraft({ ...draft, welcomeMessage })}
              invalid={status.kind === 'invalid' && status.fields.includes('welcomeMessage')} />
            <button type="submit" disabled={status.kind === 'load-version'}>Salvar informações</button>
          </fieldset>
          {status.kind === 'busy' && <p role="status">Salvando informações…</p>}
          {status.kind === 'saved' && <p role="status">Informações salvas.</p>}
          {status.kind === 'conflict' && <p role="alert">O evento mudou em outra sessão. Confira as informações atuais antes de salvar seu rascunho.</p>}
          {status.kind === 'load-version' && (
            <>
              <p role="alert">Não foi possível consultar a versão atual. Seu rascunho foi preservado.</p>
              <button type="button" onClick={() => void run(refreshVersion)}>Consultar versão atual</button>
            </>
          )}
          {status.kind === 'failed' && <p role="alert">Serviço temporariamente indisponível. Tente novamente em instantes.</p>}
        </form>
      )}
    </section>
  )
}
