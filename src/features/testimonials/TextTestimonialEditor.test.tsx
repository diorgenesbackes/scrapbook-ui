import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, it } from 'vitest'
import { TextTestimonialEditor } from './TextTestimonialEditor'
import { reviewTextTestimonial } from './testimonialText'

function Editor() {
  const [text, setText] = useState('')
  return <TextTestimonialEditor text={text} onTextChange={setText} onReview={() => reviewTextTestimonial('evento-A', text) !== null} />
}

afterEach(cleanup)

it('orienta texto em branco, anuncia o limite e mantém o contador e a edição', () => {
  render(<Editor />)
  const field = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Seu depoimento' })
  expect(screen.queryByText(/caracteres restantes/)).toBeNull()
  fireEvent.change(field, { target: { value: '  ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Revisar' }))
  expect(screen.getByRole('alert').textContent).toBe('Escreva um depoimento de até 5.000 caracteres.')
  expect(document.activeElement).toBe(field)
  fireEvent.change(field, { target: { value: '🫶'.repeat(4500) } })
  expect(screen.getByText('500 caracteres restantes.')).toBeTruthy()
  fireEvent.change(field, { target: { value: '🫶'.repeat(5001) } })
  expect(field.value).toBe('🫶'.repeat(4500))
  expect(screen.getByRole('alert')).toBeTruthy()
  fireEvent.change(field, { target: { value: 'Saúde' } })
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.queryByText(/caracteres restantes/)).toBeNull()
})

it('trunca somente a parte excedente da colagem e mantém o sufixo', () => {
  render(<Editor />)
  const field = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Seu depoimento' })
  const original = 'a'.repeat(4999) + 'Z'
  fireEvent.change(field, { target: { value: original } })
  field.setSelectionRange(4998, 4999)
  fireEvent.paste(field, { clipboardData: { getData: () => '😀extra' } })
  expect(field.value).toBe('a'.repeat(4998) + '😀Z')
  expect(field.selectionStart).toBe(5000)
  expect(screen.getByText('0 caracteres restantes.')).toBeTruthy()
  expect(screen.getByRole('alert')).toBeTruthy()
})
