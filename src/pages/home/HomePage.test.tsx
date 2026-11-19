import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HomePage } from './HomePage'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('HomePage', () => {
  it('preserves the semantic shell when local diagnostics are disabled', () => {
    render(<HomePage diagnosticsEnabled={false} />)
    expect(screen.getByRole('main')).toBeDefined()
    expect(screen.getByRole('heading', { level: 1, name: 'Bem-vindo ao Scrap Book' })).toBeDefined()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('announces unavailability and retries only on request', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('proxy unavailable', { status: 503 }))
      .mockResolvedValueOnce(Response.json({ status: 'up' }))
    vi.stubGlobal('fetch', fetch)
    render(<HomePage diagnosticsEnabled />)
    expect(fetch).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Verificar disponibilidade' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('temporariamente indisponível'))
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Ambiente disponível.'))
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('prevents duplicate requests and cancels on leaving the page', async () => {
    let signal: AbortSignal | undefined
    let respond: ((response: Response) => void) | undefined
    const fetch = vi.fn((_url: string, options: RequestInit) => {
      signal = options.signal ?? undefined
      return new Promise<Response>((resolve) => { respond = resolve })
    })
    vi.stubGlobal('fetch', fetch)
    const page = render(<HomePage diagnosticsEnabled />)
    const button = screen.getByRole('button', { name: 'Verificar disponibilidade' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(screen.getByRole('status').textContent).toBe('Verificando disponibilidade…')
    expect(fetch).toHaveBeenCalledTimes(1)
    page.unmount()
    expect(signal?.aborted).toBe(true)
    await act(async () => { respond?.(Response.json({ status: 'up' })) })
  })
})
