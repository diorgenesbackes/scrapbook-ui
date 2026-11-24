import { useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import './guest-identification.css'

export type GuestAccessNotice = Readonly<{ code: string; body: string }>

export type GuestIdentification = Readonly<{
  eventCode: string
  guestName: string
  noticeCode: string
  acceptedAt: string
}>

export function GuestIdentificationForm({ eventCode, notice, onConfirm, initialName = '', focusName = false }: {
  eventCode: string
  notice: GuestAccessNotice
  onConfirm: (identification: GuestIdentification) => void
  initialName?: string
  focusName?: boolean
}) {
  const id = useId()
  const nameInput = useRef<HTMLInputElement>(null)
  const noticeInput = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(initialName)
  const [accepted, setAccepted] = useState(false)
  const [invalid, setInvalid] = useState<{ name: boolean; notice: boolean } | null>(null)
  const guestName = name.trim()
  const nameError = invalid?.name && !guestName
  const noticeError = invalid?.notice && !accepted

  useLayoutEffect(() => {
    if (focusName) nameInput.current?.focus()
  }, [focusName])

  useLayoutEffect(() => {
    if (invalid?.name) nameInput.current?.focus()
    else if (invalid?.notice) noticeInput.current?.focus()
  }, [invalid])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!guestName || !accepted) {
      setInvalid({ name: !guestName, notice: !accepted })
      return
    }
    setInvalid(null)
    onConfirm({ eventCode, guestName, noticeCode: notice.code, acceptedAt: new Date().toISOString() })
  }

  return (
    <form className="guest-identification" method="post" noValidate onSubmit={submit}>
      <div>
        <label htmlFor={id + '-name'}>Nome ou apelido</label>
        <input id={id + '-name'} ref={nameInput} type="text" autoComplete="off" required value={name}
          aria-invalid={nameError || undefined} aria-describedby={nameError ? id + '-name-error' : undefined}
          onChange={event => {
            const value = event.currentTarget.value
            setName(value)
            if (value.trim() !== guestName) setAccepted(false)
          }} />
        {nameError && <p id={id + '-name-error'} className="guest-identification-error">Informe seu nome ou apelido.</p>}
      </div>
      <div>
        <p id={id + '-notice'}>{notice.body}</p>
        <label className="guest-identification-consent">
          <input ref={noticeInput} type="checkbox" required checked={accepted} aria-invalid={noticeError || undefined}
            aria-describedby={id + '-notice' + (noticeError ? ' ' + id + '-notice-error' : '')}
            onChange={event => setAccepted(event.currentTarget.checked)} />
          <span>Li o aviso de acesso.</span>
        </label>
        {noticeError && <p id={id + '-notice-error'} className="guest-identification-error">Confirme que você leu o aviso para continuar.</p>}
      </div>
      <button type="submit">Continuar</button>
    </form>
  )
}
