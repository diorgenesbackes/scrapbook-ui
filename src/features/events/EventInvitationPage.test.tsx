import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { EventInvitationPage } from './EventInvitationPage'
import { createInvitation, getCurrentInvitation, type InvitationResult } from './invitationService'

vi.mock('./invitationService', () => ({ getCurrentInvitation: vi.fn(), createInvitation: vi.fn() }))

const pending: InvitationResult = {
  kind: 'pending', invitation: { id: '2', token: 'v1.fixture.' + 'A'.repeat(43), expiresAt: '2030-02-03T12:00:00Z' },
}

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
  Reflect.deleteProperty(navigator, 'clipboard')
})

it('preserva a chave e recupera um convite após perda de resposta', async () => {
  vi.mocked(getCurrentInvitation).mockResolvedValue({ kind: 'available' })
  vi.mocked(createInvitation).mockResolvedValueOnce({ kind: 'failed' }).mockResolvedValueOnce(pending)
  render(<EventInvitationPage eventId="42" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Gerar convite' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Recuperar convite' }))
  const field = await screen.findByRole<HTMLInputElement>('textbox', { name: 'Link do convite' })
  expect(field.value).toBe(window.location.origin + '/convites/aceitar#' + pending.invitation.token)
  const calls = vi.mocked(createInvitation).mock.calls
  expect(calls[0]?.[1]).toBe(calls[1]?.[1])
})

it('mantém o convite na confirmação cancelada e oferece cópia manual', async () => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
    writeText: vi.fn().mockRejectedValue(new Error('Clipboard indisponível')),
  } })
  vi.mocked(getCurrentInvitation).mockResolvedValue(pending)
  render(<EventInvitationPage eventId="42" />)
  const field = await screen.findByRole<HTMLInputElement>('textbox', { name: 'Link do convite' })
  fireEvent.click(screen.getByRole('button', { name: 'Copiar link' }))
  await waitFor(() => expect(document.activeElement).toBe(field))
  expect(field.selectionEnd).toBe(field.value.length)
  fireEvent.click(screen.getByRole('button', { name: 'Substituir convite' }))
  expect(screen.getByRole('button', { name: 'Confirmar substituição' })).toBe(document.activeElement)
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(screen.getByRole('button', { name: 'Substituir convite' })).toBe(document.activeElement)
  expect(createInvitation).not.toHaveBeenCalled()
})

it('preserva foco e confirmação ao revalidar o mesmo convite', async () => {
  let resolve!: (value: InvitationResult) => void
  const delayed = new Promise<InvitationResult>(complete => { resolve = complete })
  vi.mocked(getCurrentInvitation).mockResolvedValueOnce(pending).mockReturnValueOnce(delayed)
  render(<EventInvitationPage eventId="42" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Substituir convite' }))
  const confirm = screen.getByRole('button', { name: 'Confirmar substituição' })

  fireEvent.focus(window)
  expect(confirm.getAttribute('aria-disabled')).toBe('true')
  fireEvent.click(confirm)
  expect(createInvitation).not.toHaveBeenCalled()
  expect(document.activeElement).toBe(confirm)

  await act(async () => resolve(pending))
  expect(screen.getByRole('button', { name: 'Confirmar substituição' })).toBe(confirm)
  expect(document.activeElement).toBe(confirm)
  expect(confirm.hasAttribute('aria-disabled')).toBe(false)
})

it.each([['locked', 'Os convites deste evento estão travados.'], ['full', 'Este evento já tem dois responsáveis.']] as const)(
  'oculta emissão e link quando o evento está %s', async (kind, label) => {
    vi.mocked(getCurrentInvitation).mockResolvedValue({ kind })
    render(<EventInvitationPage eventId="42" />)
    await screen.findByText(label)
    expect(screen.queryByRole('button', { name: 'Gerar convite' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Link do convite' })).toBeNull()
  })

it.each(['locked', 'unavailable'] as const)('reconsulta após recusar a substituição como %s e retira o convite', async kind => {
  vi.mocked(getCurrentInvitation).mockResolvedValueOnce(pending).mockResolvedValue({ kind: 'locked' })
  vi.mocked(createInvitation).mockResolvedValue({ kind })
  render(<EventInvitationPage eventId="42" />)

  await screen.findByRole('img', { name: 'QR code do convite de responsável' })
  expect(screen.getByRole('textbox', { name: 'Link do convite' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Substituir convite' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar substituição' }))

  await waitFor(() => expect(getCurrentInvitation).toHaveBeenCalledTimes(2))
  const notice = await screen.findByText('Os convites deste evento estão travados.')
  expect(notice.getAttribute('role')).toBe('status')
  expect(getCurrentInvitation).toHaveBeenLastCalledWith('42', expect.any(AbortSignal))
  expect(screen.queryByRole('img', { name: 'QR code do convite de responsável' })).toBeNull()
  expect(screen.queryByRole('textbox', { name: 'Link do convite' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Copiar link' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Substituir convite' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Gerar convite' })).toBeNull()
})
