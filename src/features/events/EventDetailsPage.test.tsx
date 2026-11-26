import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { getJson, putJson } from '../../lib/httpClient'
import { EventDetailsPage } from './EventDetailsPage'

vi.mock('../../lib/httpClient', () => ({ getJson: vi.fn(), putJson: vi.fn() }))

const eventPath = '/api/v1/events/42'
const event = {
  id: '42',
  name: 'Celebração sintética',
  startsAt: '2032-02-29T18:00:00',
  welcomeMessage: 'Boas-vindas',
  usesDefaultWelcomeMessage: false,
  cover: { kind: 'default' },
  canEditDetails: true,
  version: '1',
  submissionOpensAt: '2032-02-29T16:00:00',
  submissionClosesAt: '2032-03-01T12:00:00',
  completionDeadlineAt: '2032-03-01T13:00:00',
  openingPolicy: { mode: 'scheduled', opensOn: '2032-03-08', state: 'flexible', canEdit: true },
}

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

it.each(['EVENT_VERSION_CONFLICT', 'EVENT_LOCKED'])(
  'reconsulta após %s e mantém a alteração de abertura autorizada',
  async code => {
    const locked = {
      ...event,
      version: '2',
      canEditDetails: false,
      firstRecord: { guestName: 'Remetente de teste', text: 'Conteúdo de teste', count: 1 },
    }
    vi.mocked(getJson)
      .mockResolvedValueOnce({ kind: 'ok', payload: event })
      .mockResolvedValue({ kind: 'ok', payload: locked })
    vi.mocked(putJson)
      .mockResolvedValueOnce({ kind: 'http', status: 409, payload: { code }, retryAfter: null })
      .mockResolvedValueOnce({
        kind: 'ok',
        payload: { ...locked, version: '3', openingPolicy: { ...event.openingPolicy, opensOn: '2032-03-10' } },
      })
    render(<EventDetailsPage eventId="42" />)

    fireEvent.change(await screen.findByRole('textbox', { name: 'Nome do evento' }), {
      target: { value: 'Rascunho de edição' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar informações' }))

    const notice = await screen.findByText('As informações deste evento estão travadas.')
    expect(notice.getAttribute('role')).toBe('status')
    expect(getJson).toHaveBeenCalledTimes(2)
    expect(getJson).toHaveBeenLastCalledWith(eventPath, expect.any(AbortSignal))
    expect(screen.queryByRole('textbox', { name: 'Nome do evento' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Salvar informações' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Convidar responsável' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Compartilhar com convidados' })).toBeTruthy()
    expect(screen.queryByText(/Remetente de teste|Conteúdo de teste/)).toBeNull()

    fireEvent.change(screen.getByLabelText('Data de abertura das lembranças'), { target: { value: '2032-03-10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar abertura' }))

    await screen.findByText('Configuração de abertura salva.')
    expect(putJson).toHaveBeenLastCalledWith(eventPath + '/opening-policy',
      { mode: 'scheduled', opensOn: '2032-03-10', expectedVersion: '2' }, expect.any(AbortSignal))
  },
)
