import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { InvitationEntryPage } from './InvitationEntryPage'
import { acceptInvitation, previewInvitation } from './invitationService'

vi.mock('./invitationService', () => ({ previewInvitation: vi.fn(), acceptInvitation: vi.fn() }))

const token = 'v1.test.' + 'A'.repeat(43)
const entry = '/convites/aceitar'
const preview = { kind: 'eligible', eventName: 'Celebração sintética', expiresAt: '2030-02-03T12:00:00Z' } as const

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
  window.history.replaceState(null, '', '/')
})

it('remove o fragmento na prévia e só aceita após uma ação explícita', async () => {
  window.history.replaceState(null, '', entry + '#' + token)
  vi.mocked(previewInvitation).mockResolvedValue(preview)
  vi.mocked(acceptInvitation).mockResolvedValue({ kind: 'problem', reason: 'locked' })
  render(<InvitationEntryPage />)

  await screen.findByRole('heading', { name: 'Celebração sintética' })
  expect(window.location.hash).toBe('')
  expect(previewInvitation).toHaveBeenCalledWith(token, expect.any(AbortSignal))
  expect(acceptInvitation).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: 'Aceitar convite' }))
  expect((await screen.findByRole('alert')).textContent).toContain('Os convites deste evento estão travados.')
  expect(acceptInvitation).toHaveBeenCalledWith(token, expect.any(AbortSignal))
})

it('oculta o evento e a ação quando a conta não está confirmada', async () => {
  window.history.replaceState(null, '', entry + '#' + token)
  vi.mocked(previewInvitation).mockResolvedValue({ kind: 'problem', reason: 'unconfirmed' })
  render(<InvitationEntryPage />)

  expect((await screen.findByRole('alert')).textContent).toContain('Confirme seu e-mail para aceitar o convite.')
  expect(screen.queryByRole('button', { name: 'Aceitar convite' })).toBeNull()
  expect(acceptInvitation).not.toHaveBeenCalled()
})

it('recupera a tentativa perdida com o token mantido em memória', async () => {
  window.history.replaceState(null, '', entry + '#' + token)
  vi.mocked(previewInvitation).mockResolvedValue(preview)
  vi.mocked(acceptInvitation).mockResolvedValueOnce({ kind: 'problem', reason: 'failed' })
    .mockResolvedValueOnce({ kind: 'problem', reason: 'used' })
  render(<InvitationEntryPage />)

  fireEvent.click(await screen.findByRole('button', { name: 'Aceitar convite' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Recuperar aceite' }))
  expect((await screen.findByRole('alert')).textContent).toContain('Este convite já foi usado.')
  expect(vi.mocked(acceptInvitation).mock.calls.map(args => args[0])).toEqual([token, token])
})

it('revalida a prévia ao retornar à página e retira evento e aceite após a trava', async () => {
  window.history.replaceState(null, '', entry + '#' + token)
  vi.mocked(previewInvitation).mockResolvedValueOnce(preview)
    .mockResolvedValue({ kind: 'problem', reason: 'locked' })
  render(<InvitationEntryPage />)

  await screen.findByRole('heading', { name: 'Celebração sintética' })
  window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))

  expect((await screen.findByRole('alert')).textContent).toContain('Os convites deste evento estão travados.')
  expect(screen.queryByRole('heading', { name: 'Celebração sintética' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Aceitar convite' })).toBeNull()
  expect(previewInvitation).toHaveBeenCalledTimes(2)
  expect(acceptInvitation).not.toHaveBeenCalled()
})
