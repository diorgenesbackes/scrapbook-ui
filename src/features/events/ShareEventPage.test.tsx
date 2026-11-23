import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ShareEventPage } from './ShareEventPage'
import { getEvent, getEventPublicLink, type EventDetail } from './eventService'

vi.mock('./eventService', () => ({ getEvent: vi.fn(), getEventPublicLink: vi.fn() }))

const code = 'Q'.repeat(43)
const event: EventDetail = { id: '1', name: 'Celebração', startsAt: '2032-02-29T01:00:00', version: '0',
  welcomeMessage: 'Olá', usesDefaultWelcomeMessage: false, canEditDetails: true,
  submissionOpensAt: '2032-02-28T23:00:00', submissionClosesAt: '2032-03-01T12:00:00',
  completionDeadlineAt: '2032-03-01T13:00:00', openingPolicy: { mode: 'immediate', opensOn: null, state: 'flexible', canEdit: true } }

function presentLink() {
  vi.mocked(getEvent).mockResolvedValue({ kind: 'ready', data: event })
  vi.mocked(getEventPublicLink).mockResolvedValue({ kind: 'ready', data: code })
  render(<ShareEventPage eventId="1" />)
}

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
  Reflect.deleteProperty(window.navigator, 'clipboard')
})

it('copia o link canônico e anuncia sucesso', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText } })
  presentLink()
  fireEvent.click(await screen.findByRole('button', { name: 'Copiar link' }))
  expect(writeText).toHaveBeenCalledWith(window.location.origin + '/e/' + code)
  await screen.findByText('Link copiado.')
  await screen.findByRole('img', { name: 'QR code da página dos convidados' })
})

it('seleciona o endereço para cópia manual após falha da área de transferência', async () => {
  const writeText = vi.fn().mockRejectedValue(new Error('sem permissão'))
  Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText } })
  presentLink()
  const field = await screen.findByRole<HTMLInputElement>('textbox', { name: 'Link dos convidados' })
  fireEvent.click(screen.getByRole('button', { name: 'Copiar link' }))
  await waitFor(() => expect(document.activeElement).toBe(field))
  expect(field.selectionStart).toBe(0)
  expect(field.selectionEnd).toBe(field.value.length)
})

it('oculta o link quando a sessão do evento expirou', async () => {
  vi.mocked(getEvent).mockResolvedValue({ kind: 'expired' })
  vi.mocked(getEventPublicLink).mockResolvedValue({ kind: 'ready', data: code })
  render(<ShareEventPage eventId="1" />)
  expect((await screen.findByRole('alert')).textContent).toContain('Sua sessão terminou')
  expect(screen.queryByRole('textbox', { name: 'Link dos convidados' })).toBeNull()
})
