import { useId, useLayoutEffect } from 'react'
import { mediaCaptionLimit } from './guestContribution'
import { useContributionTextInput } from './useContributionTextInput'

export function MediaCaptionEditor({ label, caption, onChange }: { label: string; caption: string | null; onChange: (value: string | null) => void }) {
  if (caption !== null) return <MediaCaptionField label={label} caption={caption} onChange={onChange} onRemove={() => onChange(null)} />
  return <button type="button" className="testimonial-secondary" onClick={() => onChange('')}>Deseja adicionar uma legenda?</button>
}

export function MediaCaptionField({ label, caption, onChange, onRemove }: { label: string; caption: string; onChange: (value: string) => void; onRemove: () => void }) {
  const id = useId()
  const { input, remaining, limited, change, paste } = useContributionTextInput(caption, onChange, mediaCaptionLimit)
  const counter = remaining <= 100

  useLayoutEffect(() => { input.current?.focus() }, [input])

  return (
    <div className="testimonial-editor">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} ref={input} value={caption} onChange={event => change(event.currentTarget.value)} onPaste={paste}
        aria-describedby={[counter ? id + '-count' : '', limited ? id + '-limit' : ''].filter(Boolean).join(' ') || undefined} />
      {counter && <p id={id + '-count'}>{remaining} caracteres restantes na legenda.</p>}
      {limited && <p id={id + '-limit'} role="alert" className="testimonial-error">A legenda deve ter até 500 caracteres.</p>}
      <button type="button" className="testimonial-secondary" onClick={onRemove}>Remover legenda</button>
    </div>
  )
}
