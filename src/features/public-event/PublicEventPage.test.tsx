import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { GuestEventRoute } from '../../routes/GuestEventRoute'
import { getPublicEvent, type PublicEventResult, type SubmissionState } from './publicEventService'

vi.mock('./publicEventService', () => ({ getPublicEvent: vi.fn() }))
vi.mock('../testimonials/DraftDiscardDialog', () => ({
  DraftDiscardDialog: ({ onStay, onDiscard }: { onStay: () => void; onDiscard: () => void }) => (
    <div role="dialog" aria-label="Descarte">
      <button type="button" onClick={onStay}>Permanecer</button>
      <button type="button" onClick={onDiscard}>Descartar rascunho</button>
    </div>
  ),
}))

const code = '_lv5Uj97Qkq7kckeOtjXoY3jHviZqegNrKxNPEp8yXQ'
const path = '/e/' + code
const serverTime = Date.parse('2032-02-28T23:00:00Z')

function result(state: SubmissionState, duration = 2_000, name = 'Festa no jardim'): PublicEventResult {
  return {
    kind: 'ready', event: {
      name, startsAt: '2032-02-29T01:00:00', welcomeMessage: 'Bem-vindo ao evento.', serverTime,
      submissionWindow: {
        state, opensAt: '2032-02-28T23:00:00', closesAt: '2032-03-01T12:00:00',
        completionDeadlineAt: '2032-03-01T13:00:00', nextTransitionAt: state === 'closed' ? null : serverTime + duration,
      },
    },
  }
}

async function advance(milliseconds: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds) })
}

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

it('informa o horário de abertura sem oferecer ações antecipadas', async () => {
  vi.mocked(getPublicEvent).mockResolvedValue(result('before'))
  render(<GuestEventRoute pathname={path} />)
  await screen.findByRole('heading', { name: 'Festa no jardim' })
  expect(screen.getByRole('status').textContent).toContain('28/02/2032 às 23:00')
  expect(screen.queryByRole('button')).toBeNull()
})

it('aguarda confirmação para abrir o depoimento e retira o ingresso no fechamento', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
  const get = vi.mocked(getPublicEvent)
  let confirm: (value: PublicEventResult) => void = () => undefined
  get.mockResolvedValueOnce(result('before')).mockImplementationOnce(() => new Promise(resolve => { confirm = resolve }))
    .mockResolvedValue({ kind: 'failed', correlationId: null, retryAfterMs: 0 })
  render(<GuestEventRoute pathname={path} />)
  await advance(3_000)
  expect(get).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole('link', { name: 'Deixe um depoimento' })).toBeNull()
  await act(async () => confirm(result('open', 5_000)))
  expect(screen.getByRole('link', { name: 'Deixe um depoimento' }).getAttribute('href')).toBe(path + '/depoimento')
  expect(screen.getByRole('link', { name: 'Registre um momento' }).getAttribute('href')).toBe(path + '/momento')
  await advance(5_000)
  expect(screen.getByRole('status').textContent).toContain('O prazo para novos envios terminou.')
  expect(screen.queryByRole('button')).toBeNull()
  await advance(1_000)
  expect(screen.getByRole('alert').textContent).toContain('Serviço temporariamente indisponível.')
})

it('reconsulta após retorno à aba e ignora resposta de outro evento', async () => {
  const get = vi.mocked(getPublicEvent)
  let complete: (value: PublicEventResult) => void = () => undefined
  get.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    .mockResolvedValueOnce(result('closed', 0, 'Outro evento'))
    .mockResolvedValueOnce(result('before', 1_000, 'Evento atualizado'))

  const app = render(<GuestEventRoute pathname={path} />)
  app.rerender(<GuestEventRoute pathname={'/e/' + 'B'.repeat(43)} />)
  await screen.findByRole('heading', { name: 'Outro evento' })
  expect(get.mock.calls[0]?.[1].aborted).toBe(true)
  await act(async () => complete(result('open')))
  expect(screen.queryByRole('heading', { name: 'Festa no jardim' })).toBeNull()

  fireEvent(document, new Event('visibilitychange'))
  await screen.findByRole('heading', { name: 'Evento atualizado' })
})

it('encerra as ações enquanto uma reconsulta periódica ainda está pendente', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  const get = vi.mocked(getPublicEvent)
  get.mockResolvedValueOnce(result('open', 300_100)).mockImplementationOnce(() => new Promise(() => undefined))
  render(<GuestEventRoute pathname={path} />)

  await advance(300_000)
  expect(get).toHaveBeenCalledTimes(2)
  expect(screen.getByRole('link', { name: 'Deixe um depoimento' }).getAttribute('href')).toBe(path + '/depoimento')
  await advance(100)
  expect(screen.queryByRole('link', { name: 'Deixe um depoimento' })).toBeNull()
  expect(screen.getByRole('status').textContent).toContain('O prazo para novos envios terminou.')
})

it('usa a mesma mensagem para código inválido e desconhecido', async () => {
  const get = vi.mocked(getPublicEvent)
  get.mockResolvedValue({ kind: 'unavailable' })
  const app = render(<GuestEventRoute pathname="/e/invalido" />)
  screen.getByRole('heading', { name: 'Evento indisponível.' })
  expect(get).not.toHaveBeenCalled()
  app.rerender(<GuestEventRoute pathname={path} />)
  await screen.findByRole('heading', { name: 'Evento indisponível.' })
  expect(get.mock.calls[0]?.[0]).toBe(code)
})

it('respeita o tempo informado na limitação antes de oferecer nova consulta', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  vi.mocked(getPublicEvent).mockResolvedValueOnce({ kind: 'failed', retryAfterMs: 1_000, correlationId: null })
    .mockResolvedValueOnce(result('closed'))
  render(<GuestEventRoute pathname={path} />)
  await advance(0)
  const retry = screen.getByRole<HTMLButtonElement>('button', { name: 'Tentar novamente' })
  expect(retry.disabled).toBe(true)
  await advance(1_000)
  expect(retry.disabled).toBe(false)
  fireEvent.click(retry)
  await advance(0)
  expect(screen.getByRole('heading', { name: 'Festa no jardim' })).toBeTruthy()
})

it('reserva a S17 ao diagnóstico local e à janela aberta', async () => {
  vi.stubEnv('VITE_ENABLE_LOCAL_DIAGNOSTICS', 'false')
  const preview = path + '/identificacao'
  const get = vi.mocked(getPublicEvent)
  const app = render(<GuestEventRoute pathname={preview} />)
  screen.getByRole('heading', { name: 'Evento indisponível.' })
  expect(get).not.toHaveBeenCalled()

  vi.stubEnv('VITE_ENABLE_LOCAL_DIAGNOSTICS', 'true')
  get.mockResolvedValue(result('closed'))
  app.rerender(<GuestEventRoute pathname={preview} />)
  await screen.findByText('O prazo para novos envios terminou.')
  expect(screen.queryByRole('heading', { name: 'Identificação' })).toBeNull()
})

it('deriva a identificação do código verificado e reinicia o formulário ao trocar de evento', async () => {
  vi.stubEnv('VITE_ENABLE_LOCAL_DIAGNOSTICS', 'true')
  const get = vi.mocked(getPublicEvent)
  get.mockResolvedValueOnce(result('open', 90_000)).mockResolvedValueOnce(result('open', 90_000, 'Segundo evento'))
  const app = render(<GuestEventRoute pathname={path + '/identificacao'} />)
  const name = await screen.findByRole<HTMLInputElement>('textbox', { name: 'Nome ou apelido' })
  fireEvent.change(name, { target: { value: 'Ana' } })
  fireEvent.click(screen.getByRole('checkbox'))
  expect(get.mock.calls[0]?.[0]).toBe(code)

  const otherCode = 'B'.repeat(43)
  app.rerender(<GuestEventRoute pathname={'/e/' + otherCode + '/identificacao'} />)
  await screen.findByText('Segundo evento')
  expect((await screen.findByRole<HTMLInputElement>('textbox', { name: 'Nome ou apelido' })).value).toBe('')
  expect(screen.getByRole<HTMLInputElement>('checkbox').checked).toBe(false)
  expect(get.mock.calls[1]?.[0]).toBe(otherCode)
})

it('mantém o rascunho no fechamento e exige janela aberta ao iniciar pela rota direta', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  const get = vi.mocked(getPublicEvent)
  get.mockResolvedValueOnce(result('open', 4_000)).mockResolvedValue(result('closed'))
  const app = render(<GuestEventRoute pathname={path + '/depoimento'} />)
  await advance(0)
  fireEvent.click(screen.getByRole('button', { name: 'Escrever depoimento' }))
  const field = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Seu depoimento' })
  fireEvent.change(field, { target: { value: 'Rascunho sintético' } })
  await advance(4_000)
  expect(screen.getByText('O prazo para novos envios terminou.')).toBeTruthy()
  expect(field.value).toBe('Rascunho sintético')
  fireEvent.click(screen.getByRole('button', { name: 'Revisar' }))
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Enviar' }).disabled).toBe(true)
  app.rerender(<GuestEventRoute pathname={'/e/' + 'B'.repeat(43) + '/depoimento'} />)
  await advance(0)
  expect(screen.queryByText('Rascunho sintético')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Escrever depoimento' })).toBeNull()
})

it('mantém a edição ao permanecer e reinicia a composição ao confirmar o descarte', async () => {
  vi.mocked(getPublicEvent).mockResolvedValue(result('open', 90_000))
  render(<GuestEventRoute pathname={path + '/depoimento'} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Escrever depoimento' }))
  const field = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Seu depoimento' })
  fireEvent.change(field, { target: { value: 'Um rascunho de teste' } })
  fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))
  fireEvent.click(screen.getByRole('button', { name: 'Permanecer' }))
  expect(field.value).toBe('Um rascunho de teste')
  fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))
  fireEvent.click(screen.getByRole('button', { name: 'Descartar rascunho' }))
  fireEvent.click(screen.getByRole('button', { name: 'Escrever depoimento' }))
  expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Seu depoimento' }).value).toBe('')
})
