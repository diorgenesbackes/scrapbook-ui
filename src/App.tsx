import { lazy, Suspense } from 'react'
import { environment } from './config/environment'
import { GuestEventRoute, isGuestRoute } from './routes/GuestEventRoute'

const AppRoutes = lazy(async () => ({ default: (await import('./routes/AppRoutes')).AppRoutes }))

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
      <Suspense fallback={<main id="conteudo" tabIndex={-1} className="main"><p role="status">Carregando…</p></main>}>
        {guest ? <GuestEventRoute pathname={pathname} />
          : <AppRoutes pathname={pathname} diagnosticsEnabled={environment.diagnosticsEnabled} />}
      </Suspense>
    </>
  )
}
