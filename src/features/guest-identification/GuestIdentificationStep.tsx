import { useEffect, useState } from 'react'
import { GuestIdentificationForm, type GuestAccessNotice, type GuestIdentification } from './GuestIdentificationForm'
import { readGuestIdentification, saveGuestIdentification } from './guestIdentificationStorage'

export type GuestIdentificationConfirmation = Readonly<{
  identification: GuestIdentification
  remembered: boolean
}>

type Props = {
  eventCode: string
  notice: GuestAccessNotice
  onConfirm: (confirmation: GuestIdentificationConfirmation) => void
}

type View =
  | { kind: 'loading' }
  | { kind: 'returning'; identification: GuestIdentification }
  | { kind: 'form'; reason: 'missing' | 'lost' | 'editing'; name: string }

export function GuestIdentificationStep(props: Props) {
  return <GuestIdentificationForEvent key={JSON.stringify([props.eventCode, props.notice.code])} {...props} />
}

function GuestIdentificationForEvent({ eventCode, notice, onConfirm }: Props) {
  const [view, setView] = useState<View>({ kind: 'loading' })

  useEffect(() => {
    const identification = readGuestIdentification(eventCode, notice.code)
    setView(identification ? { kind: 'returning', identification } : { kind: 'form', reason: 'missing', name: '' })
  }, [eventCode, notice.code])

  function confirmNew(identification: GuestIdentification) {
    onConfirm({ identification, remembered: saveGuestIdentification(identification) })
  }

  function confirmRemembered(previous: GuestIdentification) {
    const current = readGuestIdentification(eventCode, notice.code)
    if (!current) {
      setView({ kind: 'form', reason: 'lost', name: '' })
      return
    }
    if (current.guestName !== previous.guestName || current.acceptedAt !== previous.acceptedAt) {
      setView({ kind: 'returning', identification: current })
      return
    }
    onConfirm({ identification: current, remembered: true })
  }

  if (view.kind === 'loading') return <p role="status">Carregando identificação…</p>

  if (view.kind === 'returning') {
    const { identification } = view
    return (
      <div className="guest-identification-returning">
        <p>Nome ou apelido registrado</p>
        <p><strong>{identification.guestName}</strong></p>
        <button type="button" onClick={() => confirmRemembered(identification)}>Continuar</button>
        <button type="button" className="guest-edit-name"
          onClick={() => setView({ kind: 'form', reason: 'editing', name: identification.guestName })}>Editar nome</button>
      </div>
    )
  }

  return (
    <>
      {view.reason !== 'editing' && <p role="status">Informe seu nome e confirme o aviso para este evento.</p>}
      <GuestIdentificationForm eventCode={eventCode} notice={notice} initialName={view.name} focusName={view.reason !== 'missing'} onConfirm={confirmNew} />
    </>
  )
}
