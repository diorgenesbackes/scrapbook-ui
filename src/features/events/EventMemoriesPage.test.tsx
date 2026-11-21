import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AppRoutes } from '../../routes/AppRoutes'
import { getEventOpeningStatus, type OpeningStatusResult } from './eventService'

vi.mock('./eventService', () => ({ getEventOpeningStatus: vi.fn() }))

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
  vi.useRealTimers()
})

const serverTime = Date.parse('2033-02-28T02:59:00Z')
const closed: OpeningStatusResult = {
  kind: 'ready', data: { contentState: 'closed', opensOn: '2033-02-28', serverTime, opensAt: serverTime + 60_000 },
}
const open: OpeningStatusResult = { kind: 'ready', data: { contentState: 'open', serverTime } }

it('ignora resposta pendente ao trocar de evento', async () => {
  const get = vi.mocked(getEventOpeningStatus)
  let release: (result: OpeningStatusResult) => void = () => undefined
  get.mockImplementation(id => id === '1'
    ? new Promise(resolve => { release = resolve })
    : Promise.resolve(closed))

  const app = render(<AppRoutes pathname="/meus-eventos/1/lembrancas" diagnosticsEnabled={false} />)
  app.rerender(<AppRoutes pathname="/meus-eventos/2/lembrancas" diagnosticsEnabled={false} />)

  expect((await screen.findByRole('timer', { name: 'Tempo até a abertura' })).textContent).toContain('1 minuto')
  expect(get.mock.calls[0]?.[1].aborted).toBe(true)
  await act(async () => release(open))
  expect(screen.queryByText('As lembranças estão abertas.')).toBeNull()
})

it('descarta resposta antiga ao voltar e limpa a tela se a sessão expirou', async () => {
  const get = vi.mocked(getEventOpeningStatus)
  let release: (result: OpeningStatusResult) => void = () => undefined
  get.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    .mockResolvedValue({ kind: 'expired' })
  render(<AppRoutes pathname="/meus-eventos/1/lembrancas" diagnosticsEnabled={false} />)

  act(() => window.dispatchEvent(new Event('focus')))
  expect((await screen.findByRole('alert')).textContent).toContain('Sua sessão terminou')
  expect(get.mock.calls[0]?.[1].aborted).toBe(true)
  await act(async () => release(open))
  expect(screen.queryByText('As lembranças estão abertas.')).toBeNull()
  expect(screen.queryByRole('timer')).toBeNull()
})

it('usa o tempo do servidor, reconsulta no limite e aguarda a autorização', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] })
  const get = vi.mocked(getEventOpeningStatus)
  let authorize: (result: OpeningStatusResult) => void = () => undefined
  get.mockResolvedValueOnce({
    kind: 'ready', data: { contentState: 'closed', opensOn: '2033-02-28', serverTime, opensAt: serverTime + 2_000 },
  }).mockImplementationOnce(() => new Promise(resolve => { authorize = resolve }))

  render(<AppRoutes pathname="/meus-eventos/1/lembrancas" diagnosticsEnabled={false} />)
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  expect(screen.getByRole('timer').textContent).toContain('1 minuto')
  await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
  expect(get).toHaveBeenCalledTimes(2)
  expect(screen.getByRole('status').textContent).toContain('Verificando')
  await act(async () => authorize(open))
  expect(screen.getByRole('status').textContent).toBe('As lembranças estão abertas.')
})

it('substitui o estado aberto pelo bloco de data quando a política volta a fechar', async () => {
  const get = vi.mocked(getEventOpeningStatus)
  get.mockResolvedValueOnce(open).mockResolvedValue(closed)
  render(<AppRoutes pathname="/meus-eventos/1/lembrancas" diagnosticsEnabled={false} />)

  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('As lembranças estão abertas.'))
  act(() => window.dispatchEvent(new Event('focus')))
  expect((await screen.findByRole('timer')).textContent).toContain('1 minuto')
  expect(screen.queryByText('As lembranças estão abertas.')).toBeNull()
})
