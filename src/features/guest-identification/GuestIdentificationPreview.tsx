import { useState } from 'react'
import { GuestIdentificationForm, type GuestAccessNotice } from './GuestIdentificationForm'

const localNotice: GuestAccessNotice = {
  code: 'f06-local-v1',
  body: 'Apenas os responsáveis pelo evento podem acessar as contribuições, conforme a política do evento.',
}

export function GuestIdentificationPreview({ eventCode, eventName }: { eventCode: string; eventName: string }) {
  const [confirmed, setConfirmed] = useState(false)

  return (
    <>
      <p>{eventName}</p>
      <h1>Identificação</h1>
      {confirmed ? (
        <p role="status" tabIndex={-1} ref={element => { element?.focus() }}>Identificação confirmada.</p>
      ) : (
        <GuestIdentificationForm eventCode={eventCode} notice={localNotice} onConfirm={() => setConfirmed(true)} />
      )}
      <p><a href={'/e/' + eventCode}>Voltar ao evento</a></p>
    </>
  )
}
