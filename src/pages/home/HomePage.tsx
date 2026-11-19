import { useEffect, useRef, useState } from 'react'
import { checkReadiness } from '../../services/readinessService'

type ReadinessState = 'idle' | 'checking' | 'up' | 'down'

const statusMessages: Record<ReadinessState, string> = {
  idle: 'Verifique se a aplicação e o banco estão prontos.',
  checking: 'Verificando disponibilidade…',
  up: 'Ambiente disponível.',
  down: 'Serviço temporariamente indisponível. Tente novamente em instantes.',
}

export function HomePage({ diagnosticsEnabled }: { diagnosticsEnabled: boolean }) {
  const [state, setState] = useState<ReadinessState>('idle')
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])

  async function verify() {
    if (request.current) return
    const controller = new AbortController()
    request.current = controller
    setState('checking')
    try {
      const ready = await checkReadiness(controller.signal)
      if (!controller.signal.aborted) setState(ready ? 'up' : 'down')
    } catch {
      if (!controller.signal.aborted) setState('down')
    } finally {
      if (request.current === controller) request.current = null
    }
  }

  return (
    <main id="conteudo" className="main" tabIndex={-1}>
      <h1>Bem-vindo ao Scrap Book</h1>
      <p className="intro">Guarde as lembranças dos seus eventos em um só lugar.</p>
      {diagnosticsEnabled && (
        <section className="environment" aria-labelledby="environment-title">
          <h2 id="environment-title">Ambiente local</h2>
          <p className="status" data-state={state} role="status">
            {statusMessages[state]}
          </p>
          <button type="button" aria-disabled={state === 'checking'} onClick={() => void verify()}>
            {state === 'down' ? 'Tentar novamente' : 'Verificar disponibilidade'}
          </button>
        </section>
      )}
    </main>
  )
}
