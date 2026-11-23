import { useEffect, useState } from 'react'
import { environment } from './config/environment'
import { GuestEventRoute, isGuestRoute } from './routes/GuestEventRoute'

type AppRoutesView =
  | { kind: 'loading' | 'failed' }
  | { kind: 'ready'; Routes: typeof import('./routes/AppRoutes').AppRoutes }

function LoadAppRoutes({ pathname }: { pathname: string }) {
  const [view, setView] = useState<AppRoutesView>({ kind: 'loading' })

  useEffect(() => {
    let active = true
    void import('./routes/AppRoutes').then(({ AppRoutes }) => {
      if (active) setView({ kind: 'ready', Routes: AppRoutes })
    }, () => {
      if (active) setView({ kind: 'failed' })
    })
    return () => { active = false }
  }, [])

  if (view.kind === 'ready') {
    return <view.Routes pathname={pathname} diagnosticsEnabled={environment.diagnosticsEnabled} />
  }

  return (
    <main id="conteudo" tabIndex={-1} className="main" aria-busy={view.kind === 'loading'}>
      {view.kind === 'loading' ? <p role="status">Carregando…</p> : (
        <>
          <p role="alert">Serviço temporariamente indisponível. Tente novamente em instantes.</p>
          <button type="button" onClick={() => window.location.reload()}>Tentar novamente</button>
        </>
      )}
    </main>
  )
}

export function App() {
  const pathname = window.location.pathname
  const guest = isGuestRoute(pathname)
  return (
    <>
      <a className="skip-link" href="#conteudo">Ir para o conteúdo</a>
      <header className="site-header">
        <a className="wordmark" href="/">Scrap Book</a>
        {!guest && <a className="events-nav" href="/meus-eventos">Meus eventos</a>}
      </header>
      {guest ? <GuestEventRoute pathname={pathname} /> : <LoadAppRoutes pathname={pathname} />}
    </>
  )
}
