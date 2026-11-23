import { afterEach, expect, it, vi } from 'vitest'
import { getPublicEvent } from './publicEventService'

const payload = {
  name: 'Evento', startsAt: '2032-02-29T01:00:00', timeZone: 'America/Sao_Paulo', cover: { kind: 'default' },
  welcomeMessage: 'Olá', serverTime: '2032-02-29T01:00:00+00:00',
  submissionWindow: {
    state: 'before', opensAt: '2032-02-28T23:00:00', closesAt: '2032-03-01T12:00:00',
    completionDeadlineAt: '2032-03-01T13:00:00', nextTransitionAt: '2032-02-29T02:00:00Z',
  },
}

afterEach(() => vi.unstubAllGlobals())

it('consulta a rota pública sem credenciais e interpreta a janela', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json(payload))
  vi.stubGlobal('fetch', fetch)
  const { signal } = new AbortController()
  const result = await getPublicEvent('A'.repeat(43), signal)
  expect(fetch).toHaveBeenCalledWith('/api/v1/public-events/' + 'A'.repeat(43),
    expect.objectContaining({ credentials: 'omit', cache: 'no-store', signal }))
  expect(result).toMatchObject({ kind: 'ready', event: { submissionWindow: { state: 'before',
    nextTransitionAt: Date.parse('2032-02-29T02:00:00Z') } } })
})

it('recusa contrato temporal inválido e trata limitação sem JSON', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(Response.json({ ...payload, serverTime: '2032-02-29T01:00:00' }))
    .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '3' } })))
  const { signal } = new AbortController()
  expect(await getPublicEvent('A'.repeat(43), signal)).toMatchObject({ kind: 'failed', retryAfterMs: 0 })
  expect(await getPublicEvent('A'.repeat(43), signal)).toMatchObject({ kind: 'failed', retryAfterMs: 3000 })
})
