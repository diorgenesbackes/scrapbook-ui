import { useEffect, useRef, useState } from 'react'
import type { GuestAccessNotice } from '../guest-identification/GuestIdentificationForm'
import { GuestIdentificationStep, type GuestIdentificationConfirmation } from '../guest-identification/GuestIdentificationStep'
import { confirmSubmissionConsent, readSubmissionNotice } from './submissionService'

export function SubmissionIdentification({ eventCode, fallback, onConfirm }: {
  eventCode: string
  fallback: GuestAccessNotice | undefined
  onConfirm: (confirmation: GuestIdentificationConfirmation, proof: string | null) => void
}) {
  const [notice, setNotice] = useState<GuestAccessNotice | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const pending = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void readSubmissionNotice(eventCode, controller.signal).then(value => {
      if (controller.signal.aborted) return
      setNotice(value)
      setLoading(false)
    })
    return () => controller.abort()
  }, [eventCode, revision])

  useEffect(() => () => pending.current?.abort(), [])

  function refresh() {
    setLoading(true)
    setFailure(null)
    setRevision(value => value + 1)
  }

  async function confirm(value: GuestIdentificationConfirmation) {
    if (!notice) {
      onConfirm(value, null)
      return
    }
    if (pending.current) return
    const controller = new AbortController()
    pending.current = controller
    setBusy(true)
    setFailure(null)
    try {
      const result = await confirmSubmissionConsent(value.identification, controller.signal)
      if (controller.signal.aborted) return
      if (result.kind === 'ready') onConfirm(value, result.proof)
      else if (result.code === 'SUBMISSION_CONSENT_REQUIRED') refresh()
      else setFailure(result.message)
    } finally {
      if (pending.current === controller) pending.current = null
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  if (loading) return <p role="status">Carregando aviso de acesso…</p>
  const current = notice ?? fallback
  if (!current) return (
    <div>
      <p role="alert">O envio está temporariamente indisponível.</p>
      <button type="button" onClick={refresh}>Tentar novamente</button>
    </div>
  )

  return (
    <>
      <fieldset className="submission-identification" aria-label="Identificação do convidado" disabled={busy}>
        <GuestIdentificationStep eventCode={eventCode} notice={current} onConfirm={value => { void confirm(value) }} />
      </fieldset>
      {busy && <p role="status">Confirmando o aviso…</p>}
      {failure && <p role="alert" className="testimonial-error">{failure}</p>}
    </>
  )
}
