import { useEffect, useRef, useState, type FormEvent } from 'react'
import { announceOpeningChange } from './eventOpeningUpdates'
import { showCivil } from '../../utils/showCivil'
import { suggestOpeningDate } from './eventDates'
import { getEvent, replaceEventOpening, type EventDetail } from './eventService'

type Status = 'idle' | 'busy' | 'saved' | 'conflict' | 'load-version' | 'locked' | 'invalid' | 'failed'

export function EventOpeningForm({ event, onUpdated, onAccessLost }: {
  event: EventDetail
  onUpdated: (event: EventDetail) => void
  onAccessLost: (kind: 'expired' | 'not-found') => void
}) {
  const [expectedVersion, setExpectedVersion] = useState(event.version)
  const [mode, setMode] = useState(event.openingPolicy.mode)
  const [date, setDate] = useState(event.openingPolicy.opensOn ?? suggestOpeningDate(event.startsAt))
  const [status, setStatus] = useState<Status>('idle')
  const pending = useRef<AbortController | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const saveButton = useRef<HTMLButtonElement>(null)
  useEffect(() => () => pending.current?.abort(), [])

  async function refreshVersion(signal: AbortSignal, after: 'conflict' | 'locked') {
    const latest = await getEvent(event.id, signal)
    if (signal.aborted) return
    if (latest.kind === 'ready') {
      setExpectedVersion(latest.data.version)
      onUpdated(latest.data)
      setStatus(after)
    } else if (latest.kind === 'expired' || latest.kind === 'not-found') {
      onAccessLost(latest.kind)
    } else {
      setStatus('load-version')
    }
  }

  async function run(operation: (signal: AbortSignal) => Promise<void>) {
    if (pending.current) return
    const controller = new AbortController()
    pending.current = controller
    setStatus('busy')
    try {
      await operation(controller.signal)
    } finally {
      if (pending.current === controller) pending.current = null
    }
  }

  function save() {
    return run(async signal => {
      const response = await replaceEventOpening(event.id, { mode, opensOn: mode === 'scheduled' ? date : null },
        expectedVersion, signal)
      if (signal.aborted) return
      if (response.kind === 'ready') {
        setExpectedVersion(response.data.version)
        onUpdated(response.data)
        setMode(response.data.openingPolicy.mode)
        setDate(response.data.openingPolicy.opensOn ?? suggestOpeningDate(response.data.startsAt))
        setStatus('saved')
        if (response.data.version !== expectedVersion) announceOpeningChange(event.id)
      } else if (response.kind === 'conflict' || response.kind === 'locked') {
        await refreshVersion(signal, response.kind)
      } else if (response.kind === 'expired' || response.kind === 'not-found') {
        onAccessLost(response.kind)
      } else {
        setStatus(response.kind === 'invalid' ? 'invalid' : 'failed')
      }
    })
  }

  function submit(form: FormEvent<HTMLFormElement>) {
    form.preventDefault()
    if (!event.openingPolicy.canEdit || pending.current || status === 'load-version') return
    if (event.openingPolicy.mode === 'immediate' && mode === 'scheduled') {
      dialog.current?.showModal()
    } else {
      void save()
    }
  }

  const locked = !event.openingPolicy.canEdit
  const once = event.openingPolicy.state === 'immediate_once'
  const current = event.openingPolicy.opensOn ? showCivil(event.openingPolicy.opensOn) : 'Imediata'

  return (
    <section aria-labelledby="opening-title">
      <h2 id="opening-title">Configuração de abertura</h2>
      <p>Política atual: {current}</p>
      {expectedVersion !== event.version && !locked && <p>Confira a política atual antes de salvar alterações.</p>}
      {locked && <p role="status">A data de abertura deste evento está travada.</p>}
      {once && <p>O prazo para novos envios terminou. Você pode fazer uma última mudança para uma data futura.</p>}
      <form onSubmit={submit} className="event-form" aria-busy={status === 'busy'}>
        <fieldset disabled={locked || status === 'busy'}>
          <legend>Política de abertura</legend>
          <label htmlFor="opening-mode">Modo de abertura</label>
          <select id="opening-mode" value={mode}
            onChange={change => setMode(change.target.value === 'immediate' ? 'immediate' : 'scheduled')}>
            <option value="immediate">Imediata</option>
            <option value="scheduled">Em uma data futura</option>
          </select>
          {mode === 'scheduled' && <>
            <label htmlFor="opening-date">Data de abertura das lembranças</label>
            <input id="opening-date" type="date" value={date} required onChange={change => setDate(change.target.value)}
              aria-invalid={status === 'invalid'} aria-describedby={status === 'invalid' ? 'opening-error' : undefined} />
          </>}
          <button ref={saveButton} type="submit" disabled={status === 'load-version'}>Salvar abertura</button>
        </fieldset>
        {status === 'busy' && <p role="status">Verificando a configuração…</p>}
        {status === 'saved' && <p role="status">Configuração de abertura salva.</p>}
        {status === 'conflict' && <p role="alert">O evento mudou em outra sessão. Confira a política atual antes de salvar seu rascunho.</p>}
        {status === 'load-version' && (
          <>
            <p role="alert">Não foi possível consultar a versão atual. Seu rascunho foi preservado.</p>
            <button type="button" onClick={() => void run(signal => refreshVersion(signal, 'conflict'))}>Consultar versão atual</button>
          </>
        )}
        {status === 'locked' && !locked && <p role="alert">A data de abertura deste evento está travada.</p>}
        {status === 'invalid' && <p role="alert" id="opening-error">Escolha uma data futura depois do encerramento dos envios.</p>}
        {status === 'failed' && <p role="alert">Serviço temporariamente indisponível. Tente novamente em instantes.</p>}
      </form>
      <dialog ref={dialog} className="opening-dialog" aria-labelledby="opening-dialog-title"
        aria-describedby="opening-dialog-copy" onClose={() => saveButton.current?.focus()}>
        <h3 id="opening-dialog-title">Confirmar mudança de abertura</h3>
        <p id="opening-dialog-copy">{once
          ? 'Após salvar, a data será definitiva e as lembranças ficarão fechadas até a abertura.'
          : 'As lembranças ficarão fechadas até a data escolhida. Se os novos envios já tiverem encerrado ao salvar, a data será definitiva.'}</p>
        <div className="event-actions">
          <button type="button" onClick={() => dialog.current?.close()}>Voltar</button>
          <button type="button" onClick={() => { dialog.current?.close(); void save() }}>Confirmar mudança</button>
        </div>
      </dialog>
    </section>
  )
}
