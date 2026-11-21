import { useEffect, useRef, useState, type FormEvent } from 'react'
import { suggestOpeningDate } from './eventDates'
import { createEvent, type EventDraft, type OpeningMode } from './eventService'
import cover from './default-cover.jpg'
import './events.css'

type Attempt = { key: string; draft: EventDraft }
type FormState =
  | { kind: 'idle' | 'busy' | 'expired' | 'conflict' | 'failed' }
  | { kind: 'invalid'; fields: string[] }
  | { kind: 'uncertain'; expired: boolean }

export function CreateEventPage() {
  const [name, setName] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [mode, setMode] = useState<OpeningMode>('scheduled')
  const [customDate, setCustomDate] = useState<string | null>(null)
  const [state, setState] = useState<FormState>({ kind: 'idle' })
  const attempt = useRef<Attempt | null>(null)
  const pending = useRef<AbortController | null>(null)
  const error = useRef<HTMLParagraphElement>(null)
  const opensOn = customDate ?? suggestOpeningDate(startsAt)
  const fields = state.kind === 'invalid' ? state.fields : []
  useEffect(() => () => pending.current?.abort(), [])
  useEffect(() => {
    if (state.kind === 'invalid') error.current?.focus()
  }, [state.kind])

  function getAttempt(): Attempt | null {
    if (attempt.current) return attempt.current
    if ([...name.trim()].length < 1 || [...name.trim()].length > 120) {
      setState({ kind: 'invalid', fields: ['name'] })
      return null
    }
    const civil = startsAt.length === 16 ? startsAt + ':00' : startsAt
    const draft: EventDraft = { name, startsAt: civil, openingPolicy: { mode, opensOn: mode === 'scheduled' ? opensOn || null : null } }
    return { key: crypto.randomUUID(), draft }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current) return
    const recovering = attempt.current !== null
    const current = getAttempt()
    if (!current) return
    const controller = new AbortController()
    pending.current = controller
    attempt.current = current
    setState({ kind: 'busy' })
    const result = await createEvent(current.draft, current.key, controller.signal)
    pending.current = null
    if (controller.signal.aborted) return
    if (result.kind === 'ready') {
      window.location.assign('/meus-eventos/' + result.data.id)
      return
    }
    if (result.kind === 'uncertain' || recovering && (result.kind === 'expired' || result.kind === 'failed')) {
      setState({ kind: 'uncertain', expired: result.kind === 'expired' })
      return
    }
    attempt.current = null
    if (result.kind === 'invalid') setState({ kind: 'invalid', fields: result.fields })
    else if (result.kind === 'not-found') setState({ kind: 'failed' })
    else setState({ kind: result.kind })
  }

  const dateInvalid = fields.includes('openingPolicy.opensOn')
  const nameInvalid = fields.includes('name')
  const startInvalid = fields.includes('startsAt')

  return (
    <main id="conteudo" className="main event-page" tabIndex={-1}>
      <a href="/meus-eventos">Voltar a Meus eventos</a>
      <h1>Criar evento</h1>
      <form className="event-form" onSubmit={event => void submit(event)}>
        <fieldset disabled={state.kind === 'busy' || state.kind === 'uncertain'}>
          <legend>Informações do evento</legend>
          <label htmlFor="event-name">Nome do evento</label>
          <input id="event-name" value={name} onChange={event => setName(event.target.value)} required
            aria-invalid={nameInvalid} aria-describedby={nameInvalid ? 'event-name-error' : undefined} />
          {nameInvalid && <p id="event-name-error">Informe de 1 a 120 caracteres úteis.</p>}
          <label htmlFor="event-start">Data e horário do evento (Brasília)</label>
          <input id="event-start" type="datetime-local" value={startsAt} onChange={event => setStartsAt(event.target.value)} required
            aria-invalid={startInvalid} aria-describedby={startInvalid ? 'event-start-error' : undefined} />
          {startInvalid && <p id="event-start-error">Informe uma data e um horário válidos.</p>}
          <label htmlFor="event-opening-mode">Modo de abertura</label>
          <select id="event-opening-mode" value={mode}
            onChange={event => setMode(event.target.value === 'immediate' ? 'immediate' : 'scheduled')}>
            <option value="scheduled">Em uma data futura</option>
            <option value="immediate">Imediata</option>
          </select>
          {mode === 'scheduled' && <>
            <label htmlFor="event-opening">Data de abertura das lembranças</label>
            <input id="event-opening" type="date" value={opensOn} onChange={event => setCustomDate(event.target.value)}
              aria-invalid={dateInvalid} aria-describedby="event-opening-help" />
            <p id="event-opening-help">{dateInvalid
              ? 'Escolha uma data futura depois do encerramento dos envios.'
              : 'A sugestão é abrir as lembranças um ano após o evento.'}</p>
          </>}
        </fieldset>
        <section aria-label="Capa e boas-vindas">
          <img className="event-cover" src={cover} alt="" width="880" height="495" />
          <p>Seja bem-vindo! Compartilhe uma lembrança deste evento.</p>
        </section>
        {state.kind === 'invalid' && <p ref={error} tabIndex={-1} role="alert">Confira os campos destacados antes de salvar.</p>}
        {state.kind === 'expired' && <p role="alert">Sua sessão terminou. Entre novamente.</p>}
        {state.kind === 'conflict' && <p role="alert">A tentativa entrou em conflito. Consulte Meus eventos antes de enviar novamente.</p>}
        {state.kind === 'failed' && <p role="alert">Serviço temporariamente indisponível. Tente novamente em instantes.</p>}
        {state.kind === 'uncertain' && <p role="alert">{state.expired
          ? 'Sua sessão terminou. Entre novamente para recuperar a mesma tentativa.'
          : 'A confirmação ainda está pendente. Recupere a mesma tentativa.'}</p>}
        <button type="submit" disabled={state.kind === 'busy'}>
          {state.kind === 'busy' ? 'Criando evento…' : state.kind === 'uncertain' ? 'Recuperar tentativa' : 'Criar evento'}
        </button>
      </form>
    </main>
  )
}
