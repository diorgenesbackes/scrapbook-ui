import { useId, useLayoutEffect, useRef } from 'react'

export function DraftDiscardDialog({ trigger, onStay, onDiscard }: {
  trigger: HTMLElement | null
  onStay: () => void
  onDiscard: () => void
}) {
  const title = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const stay = useRef<HTMLButtonElement>(null)

  useLayoutEffect(() => {
    const element = dialog.current
    if (!element) return
    element.showModal()
    stay.current?.focus()
    return () => {
      element.close()
      if (trigger?.isConnected) trigger.focus()
    }
  }, [trigger])

  return (
    <dialog ref={dialog} className="testimonial-dialog" aria-labelledby={title} onCancel={event => {
      event.preventDefault()
      onStay()
    }}>
      <h2 id={title}>Você pode perder o trabalho em andamento.</h2>
      <div className="testimonial-actions">
        <button ref={stay} type="button" onClick={onStay}>Permanecer</button>
        <button className="testimonial-secondary" type="button" onClick={onDiscard}>Descartar rascunho</button>
      </div>
    </dialog>
  )
}
