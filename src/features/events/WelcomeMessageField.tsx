import { useId } from 'react'

export function WelcomeMessageField({ value, onChange, invalid, showDefault = false }: {
  value: string | null
  onChange: (value: string | null) => void
  invalid: boolean
  showDefault?: boolean
}) {
  const id = useId()
  const custom = value !== null

  return (
    <>
      <label htmlFor={id + '-option'}>Mensagem de boas-vindas</label>
      <select id={id + '-option'} value={custom ? 'custom' : 'default'}
        onChange={event => onChange(event.target.value === 'custom' ? '' : null)}>
        <option value="default">Usar mensagem padrão</option>
        <option value="custom">Escrever uma mensagem</option>
      </select>
      {custom ? (
        <>
          <label htmlFor={id}>Sua mensagem de boas-vindas</label>
          <textarea id={id} rows={4} value={value} required onChange={event => onChange(event.target.value)}
            aria-invalid={invalid} aria-describedby={invalid ? id + '-error' : undefined} />
          {invalid && <p id={id + '-error'}>Informe de 1 a 2.000 caracteres úteis.</p>}
        </>
      ) : showDefault && <p>Seja bem-vindo! Compartilhe uma lembrança deste evento.</p>}
    </>
  )
}
