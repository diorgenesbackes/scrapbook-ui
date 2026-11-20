import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ApplicationErrorBoundary } from './ApplicationErrorBoundary'

afterEach(cleanup)

it('shows a safe fallback and retries rendering on request', () => {
  let failed = true

  function Page() {
    if (failed) throw new Error('fixture-private-error')
    return <h1>Página recuperada</h1>
  }

  render(<ApplicationErrorBoundary><Page /></ApplicationErrorBoundary>, { onCaughtError: vi.fn() })

  expect(screen.getByRole('heading', { name: 'Serviço temporariamente indisponível' })).toBeDefined()
  expect(document.activeElement).toBe(screen.getByRole('main'))
  expect(screen.queryByText('fixture-private-error')).toBeNull()
  failed = false
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  expect(screen.getByRole('heading', { name: 'Página recuperada' })).toBeDefined()
})
