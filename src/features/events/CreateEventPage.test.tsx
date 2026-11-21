import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CreateEventPage } from './CreateEventPage'
import { createEvent } from './eventService'

vi.mock('./eventService', () => ({ createEvent: vi.fn() }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

it('preserva a chave e a entrada após perder a resposta', async () => {
  const create = vi.mocked(createEvent)
  create.mockResolvedValueOnce({ kind: 'uncertain' })
    .mockResolvedValueOnce({ kind: 'expired' })
    .mockResolvedValue({ kind: 'uncertain' })
  render(<CreateEventPage />)
  fireEvent.change(screen.getByLabelText('Nome do evento'), { target: { value: 'Festa sintética' } })
  fireEvent.change(screen.getByLabelText('Data e horário do evento (Brasília)'), { target: { value: '2032-02-29T01:30' } })
  expect(screen.getByLabelText('Data de abertura das lembranças').getAttribute('value')).toBe('2033-02-28')
  fireEvent.submit(screen.getByRole('button', { name: 'Criar evento' }).closest('form')!)
  const retry = await screen.findByRole('button', { name: 'Recuperar tentativa' })
  expect(screen.getByLabelText('Nome do evento').closest('fieldset')?.disabled).toBe(true)
  fireEvent.submit(retry.closest('form')!)
  await waitFor(() => expect(create).toHaveBeenCalledTimes(2))
  expect((await screen.findByRole('alert')).textContent).toContain('Sua sessão terminou')
  fireEvent.submit(retry.closest('form')!)
  await waitFor(() => expect(create).toHaveBeenCalledTimes(3))
  expect(create.mock.calls[0]?.slice(0, 2)).toEqual(create.mock.calls[1]?.slice(0, 2))
  expect(create.mock.calls[0]?.slice(0, 2)).toEqual(create.mock.calls[2]?.slice(0, 2))
})

it('mantém os valores quando o servidor recusa a data de abertura', async () => {
  vi.mocked(createEvent).mockResolvedValue({ kind: 'invalid', fields: ['openingPolicy.opensOn'] })
  render(<CreateEventPage />)
  fireEvent.change(screen.getByLabelText('Nome do evento'), { target: { value: 'Festa sintética' } })
  fireEvent.change(screen.getByLabelText('Data e horário do evento (Brasília)'), { target: { value: '2032-02-29T01:30' } })
  fireEvent.submit(screen.getByRole('button', { name: 'Criar evento' }).closest('form')!)
  expect((await screen.findByRole('alert')).textContent).toContain('Confira os campos destacados')
  expect(screen.getByLabelText('Data de abertura das lembranças').getAttribute('aria-invalid')).toBe('true')
  expect(screen.getByLabelText('Nome do evento').getAttribute('value')).toBe('Festa sintética')
})

it('envia a escolha de abertura imediata sem data de abertura', async () => {
  const create = vi.mocked(createEvent)
  create.mockResolvedValue({ kind: 'uncertain' })
  render(<CreateEventPage />)
  fireEvent.change(screen.getByLabelText('Nome do evento'), { target: { value: 'Festa sintética' } })
  fireEvent.change(screen.getByLabelText('Data e horário do evento (Brasília)'), { target: { value: '2032-02-29T01:30' } })
  fireEvent.change(screen.getByLabelText('Modo de abertura'), { target: { value: 'immediate' } })
  expect(screen.queryByLabelText('Data de abertura das lembranças')).toBeNull()
  fireEvent.submit(screen.getByRole('button', { name: 'Criar evento' }).closest('form')!)
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
  expect(create.mock.calls[0]?.[0].openingPolicy).toEqual({ mode: 'immediate', opensOn: null })
})
