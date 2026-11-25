import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readSubmission, submitText, type TextSubmission } from './submissionService'
import { useTextSubmission } from './useTextSubmission'

vi.mock('./submissionService', async importOriginal => ({
  ...await importOriginal<typeof import('./submissionService')>(),
  readSubmission: vi.fn(),
  submitText: vi.fn(),
}))

const draft: TextSubmission = {
  category: 'testimonial', format: 'text', text: 'Lembrança sintética',
  identification: { guestName: 'Nome sintético', noticeCode: 'fixture', consentProof: 'prova' },
}
const receipt = { kind: 'confirmed', confirmedAt: '2032-02-29T02:00:00Z' } as const

beforeEach(() => vi.resetAllMocks())
afterEach(() => vi.useRealTimers())

it('recupera pelo status após perder a resposta com as credenciais originais', async () => {
  vi.mocked(submitText).mockResolvedValue({ kind: 'unknown' })
  vi.mocked(readSubmission).mockResolvedValue(receipt)
  const confirmed = vi.fn()
  const { result } = renderHook(() => useTextSubmission('event', confirmed))
  await act(async () => result.current.send(draft))
  expect(result.current.view).toEqual(receipt)
  expect(confirmed).toHaveBeenCalledOnce()
  expect(readSubmission).toHaveBeenCalledWith('event', vi.mocked(submitText).mock.calls[0]?.[1], expect.any(AbortSignal))
})

it('repete somente a mesma tentativa quando o status ainda está ausente', async () => {
  vi.mocked(submitText).mockResolvedValueOnce({ kind: 'unknown' }).mockResolvedValueOnce(receipt)
  vi.mocked(readSubmission).mockResolvedValue({ kind: 'missing' })
  const confirmed = vi.fn()
  const { result } = renderHook(() => useTextSubmission('event', confirmed))
  await act(async () => result.current.send(draft))
  expect(result.current.view.kind).toBe('unknown')
  await act(async () => result.current.retry())
  expect(result.current.view).toEqual(receipt)
  expect(vi.mocked(submitText).mock.calls[0]?.[1]).toBe(vi.mocked(submitText).mock.calls[1]?.[1])
})

it('consulta após cinco segundos sem iniciar outra escrita e aborta ao descartar', async () => {
  vi.useFakeTimers()
  vi.mocked(submitText).mockResolvedValue({ kind: 'unknown' })
  vi.mocked(readSubmission).mockResolvedValueOnce({ kind: 'missing' })
    .mockImplementationOnce(async (_code, _attempt, signal) => new Promise(resolve => {
      signal.addEventListener('abort', () => resolve({ kind: 'cancelled' }), { once: true })
    }))
  const confirmed = vi.fn()
  const { result } = renderHook(() => useTextSubmission('event', confirmed))
  await act(async () => result.current.send(draft))
  await act(async () => vi.advanceTimersByTimeAsync(5000))
  expect(submitText).toHaveBeenCalledOnce()
  expect(readSubmission).toHaveBeenCalledTimes(2)
  act(() => result.current.reset())
  expect(vi.mocked(readSubmission).mock.calls[1]?.[2].aborted).toBe(true)
  expect(result.current.view.kind).toBe('idle')
  expect(confirmed).not.toHaveBeenCalled()
})

it('impede cliques concorrentes enquanto aguarda confirmação', async () => {
  vi.mocked(submitText).mockResolvedValue(receipt)
  const confirmed = vi.fn()
  const { result } = renderHook(() => useTextSubmission('event', confirmed))
  act(() => { result.current.send(draft); result.current.send(draft) })
  await waitFor(() => expect(result.current.view).toEqual(receipt))
  expect(submitText).toHaveBeenCalledOnce()
})
