import { useId, useState, type FormEvent } from 'react'
import { testimonialTextError, testimonialTextLimit } from './testimonialText'
import { useContributionTextInput } from './useContributionTextInput'

export function TextTestimonialEditor({ text, onTextChange, onReview }: {
  text: string
  onTextChange: (text: string) => void
  onReview: () => boolean
}) {
  const id = useId()
  const { input, remaining, limited, change, paste } = useContributionTextInput(text, onTextChange, testimonialTextLimit)
  const [required, setRequired] = useState(false)
  const feedback = limited || required
  const counter = remaining <= 500

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (onReview()) return
    setRequired(true)
    input.current?.focus()
  }

  return (
    <form className="testimonial-editor" method="post" noValidate onSubmit={submit}>
      <label htmlFor={id}>Seu depoimento</label>
      <textarea id={id} ref={input} value={text} onChange={event => { setRequired(false); change(event.currentTarget.value) }}
        onPaste={event => { paste(event); if (event.defaultPrevented) setRequired(false) }}
        required aria-invalid={required || undefined}
        aria-describedby={[counter ? id + '-count' : '', feedback ? id + '-feedback' : ''].filter(Boolean).join(' ') || undefined} />
      {counter && <p id={id + '-count'}>{remaining} caracteres restantes.</p>}
      {feedback && <p id={id + '-feedback'} role="alert" className="testimonial-error">{testimonialTextError}</p>}
      <button type="submit">Revisar</button>
    </form>
  )
}
