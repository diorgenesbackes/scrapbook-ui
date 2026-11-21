import { HomePage } from '../pages/home/HomePage'
import { CreateEventPage } from '../features/events/CreateEventPage'
import { EventDetailsPage } from '../features/events/EventDetailsPage'
import { EventMemoriesPage } from '../features/events/EventMemoriesPage'
import { EventListPage } from '../features/events/EventListPage'

export function AppRoutes({ pathname, diagnosticsEnabled }: {
  pathname: string
  diagnosticsEnabled: boolean
}) {
  if (pathname === '/') return <HomePage diagnosticsEnabled={diagnosticsEnabled} />
  if (pathname === '/meus-eventos') return <EventListPage />
  if (pathname === '/meus-eventos/novo') return <CreateEventPage />
  const memoriesEventId = /^\/meus-eventos\/([1-9][0-9]*)\/lembrancas$/.exec(pathname)?.[1]
  if (memoriesEventId) return <EventMemoriesPage key={memoriesEventId} eventId={memoriesEventId} />
  const eventId = /^\/meus-eventos\/([1-9][0-9]*)$/.exec(pathname)?.[1]
  if (eventId) return <EventDetailsPage key={eventId} eventId={eventId} />
  return (
    <main id="conteudo" className="main" tabIndex={-1}>
      <h1>Página indisponível</h1>
      <a href="/">Voltar ao início</a>
    </main>
  )
}
