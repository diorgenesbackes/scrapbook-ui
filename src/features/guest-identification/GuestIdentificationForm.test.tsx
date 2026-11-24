import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { GuestIdentificationForm } from './GuestIdentificationForm'

const eventCode = 'A'.repeat(43)
const notice = { code: 'aviso-teste-v2', body: 'Aviso sintético de teste.' }

function openForm() {
  const onConfirm = vi.fn()
  render(<GuestIdentificationForm eventCode={eventCode} notice={notice} onConfirm={onConfirm} />)
  return {
    onConfirm,
    name: screen.getByRole<HTMLInputElement>('textbox', { name: 'Nome ou apelido' }),
    consent: screen.getByRole<HTMLInputElement>('checkbox', { name: 'Li o aviso de acesso.' }),
    next: screen.getByRole('button', { name: 'Continuar' }),
  }
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it('impede continuar com nome vazio ou só espaços e indica o primeiro campo inválido', () => {
  const { name, consent, next, onConfirm } = openForm()
  expect(consent.checked).toBe(false)
  fireEvent.click(next)
  expect(document.activeElement).toBe(name)
  expect(screen.getByText('Informe seu nome ou apelido.').id).toBe(name.getAttribute('aria-describedby'))
  fireEvent.change(name, { target: { value: '   ' } })
  fireEvent.click(consent)
  fireEvent.click(next)
  expect(name.getAttribute('aria-invalid')).toBe('true')
  expect(consent.checked).toBe(true)
  expect(onConfirm).not.toHaveBeenCalled()
})

it('associa o aviso e a mensagem à caixa quando falta concordância', () => {
  const { name, consent, next, onConfirm } = openForm()
  fireEvent.change(name, { target: { value: 'Ana' } })
  fireEvent.click(next)
  expect(document.activeElement).toBe(consent)
  expect(consent.getAttribute('aria-describedby')?.split(' ')).toEqual([
    screen.getByText(notice.body).id,
    screen.getByText('Confirme que você leu o aviso para continuar.').id,
  ])
  expect(onConfirm).not.toHaveBeenCalled()
})

it('reinicia a concordância ao alterar o nome e confirma para o evento e a versão exibidos', () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2032-02-29T03:00:00Z'))
  const { name, consent, next, onConfirm } = openForm()
  fireEvent.change(name, { target: { value: 'Ana' } })
  fireEvent.click(consent)
  fireEvent.change(name, { target: { value: '  Tati de Sá  ' } })
  expect(consent.checked).toBe(false)
  fireEvent.click(next)
  expect(onConfirm).not.toHaveBeenCalled()
  fireEvent.click(consent)
  fireEvent.change(name, { target: { value: ' Tati de Sá ' } })
  expect(consent.checked).toBe(true)
  fireEvent.click(next)
  expect(onConfirm).toHaveBeenCalledExactlyOnceWith({
    eventCode, guestName: 'Tati de Sá', noticeCode: notice.code, acceptedAt: '2032-02-29T03:00:00.000Z',
  })
})
