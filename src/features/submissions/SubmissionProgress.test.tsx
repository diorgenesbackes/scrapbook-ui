import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SubmissionProgress } from './SubmissionProgress'

afterEach(cleanup)

it('mostra progresso real de vídeo e troca a barra pelo estado de validação', () => {
  const onRetry = vi.fn()
  const { rerender } = render(<SubmissionProgress format="video" category="moment" onRetry={onRetry} view={{
    kind: 'transferring', loaded: 10, total: 10, completionDeadlineAt: '2032-03-01T16:00:00Z',
  }} />)

  expect(screen.getByRole('progressbar', { name: 'Transferência do vídeo' })).toBeTruthy()
  expect(screen.getByText('100%')).toBeTruthy()
  expect(screen.getByRole('status').textContent).toBe('Transferindo o vídeo.')
  expect(screen.queryByText('Recebimento confirmado')).toBeNull()

  rerender(<SubmissionProgress format="video" category="moment" onRetry={onRetry} view={{ kind: 'validating' }} />)

  expect(screen.queryByRole('progressbar')).toBeNull()
  expect(screen.getByRole('status').textContent).toMatch(/validando.*vídeo/i)
  expect(screen.queryByText('Recebimento confirmado')).toBeNull()
})

it('oferece retentativa de vídeo quando habilitada e informa a expiração', () => {
  const onRetry = vi.fn()
  const { rerender } = render(<SubmissionProgress format="video" category="testimonial" onRetry={onRetry}
    view={{ kind: 'paused', canRetry: false }} />)

  expect(screen.getByRole('status').textContent).toContain('O envio de vídeos está temporariamente indisponível.')
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Tentar novamente' }).disabled).toBe(true)

  rerender(<SubmissionProgress format="video" category="testimonial" onRetry={onRetry}
    view={{ kind: 'awaiting-receipt', canRetry: true }} />)

  expect(screen.getByRole('status').textContent).toBe('Estamos verificando o recebimento do vídeo.')
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  expect(onRetry).toHaveBeenCalledOnce()

  rerender(<SubmissionProgress format="video" category="moment" onRetry={onRetry} view={{ kind: 'expired' }} />)

  expect(screen.getByRole('alert').textContent).toBe('O prazo para concluir este envio terminou.')
  expect(screen.queryByRole('button', { name: 'Tentar novamente' })).toBeNull()
})
