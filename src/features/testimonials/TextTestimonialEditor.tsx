import { useId, useLayoutEffect, useRef, useState, type ClipboardEvent, type FormEvent } from 'react'
import { countContributionCharacters, fitTestimonialPaste, testimonialTextError, testimonialTextLimit } from './testimonialText'

export function TextTestimonialEditor({ text, onTextChange, onReview }: {
  text: string
  onTextChange: (text: string) => void
  onReview: () => boolean
}) {
  const id = useId()
  const input = useRef<HTMLTextAreaElement>(null)
  const pendingCaret = useRef<number | null>(null)
  const [feedback, setFeedback] = useState<'required' | 'limit' | null>(null)
  const remaining = testimonialTextLimit - countContributionCharacters(text)
  const counter = remaining <= 500

  useLayoutEffect(() => {
    const caret = pendingCaret.current
    if (caret === null) return
    input.current?.setSelectionRange(caret, caret)
    pendingCaret.current = null
  }, [text])

  function change(value: string) {
    if (countContributionCharacters(value) > testimonialTextLimit) {
      setFeedback('limit')
      return
    }
    onTextChange(value)
    setFeedback(null)
  }

  function paste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const field = event.currentTarget
    const fitted = fitTestimonialPaste(text, field.selectionStart, field.selectionEnd, event.clipboardData.getData('text/plain'))
    if (!fitted) return
    event.preventDefault()
    if (fitted.value !== text) {
      pendingCaret.current = fitted.caret
      onTextChange(fitted.value)
    }
    setFeedback('limit')
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (onReview()) return
    setFeedback('required')
    input.current?.focus()
  }

  return (
    <form className="testimonial-editor" method="post" noValidate onSubmit={submit}>
      <label htmlFor={id}>Seu depoimento</label>
      <textarea id={id} ref={input} value={text} onChange={event => change(event.currentTarget.value)} onPaste={paste}
        required aria-invalid={feedback === 'required' || undefined}
        aria-describedby={[counter ? id + '-count' : '', feedback ? id + '-feedback' : ''].filter(Boolean).join(' ') || undefined} />
      {counter && <p id={id + '-count'}>{remaining} caracteres restantes.</p>}
      {feedback && <p id={id + '-feedback'} role="alert" className="testimonial-error">{testimonialTextError}</p>}
      <button type="submit">Revisar</button>
    </form>
  )
}
