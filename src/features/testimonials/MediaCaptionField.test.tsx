import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { MediaCaptionField } from './MediaCaptionField'

afterEach(cleanup)

it('conta escalares Unicode e mantém o sufixo ao limitar a colagem da legenda', () => {
  const remove = vi.fn()
  function Caption() {
    const [value, setValue] = useState('')
    return <MediaCaptionField label="Legenda das fotos" caption={value} onChange={setValue} onRemove={remove} />
  }

  render(<Caption />)
  const field = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Legenda das fotos' })
  expect(document.activeElement).toBe(field)
  expect(screen.queryByText(/caracteres restantes/)).toBeNull()
  fireEvent.change(field, { target: { value: 'a'.repeat(400) } })
  expect(screen.getByText('100 caracteres restantes na legenda.')).toBeTruthy()
  fireEvent.change(field, { target: { value: 'a'.repeat(499) + 'Z' } })
  field.setSelectionRange(498, 499)
  fireEvent.paste(field, { clipboardData: { getData: () => '😀excedente' } })
  expect(field.value).toBe('a'.repeat(498) + '😀Z')
  expect(screen.getByRole('alert').textContent).toBe('A legenda deve ter até 500 caracteres.')
  fireEvent.change(field, { target: { value: 'Corrigida' } })
  expect(screen.queryByRole('alert')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Remover legenda' }))
  expect(remove).toHaveBeenCalledOnce()
})
