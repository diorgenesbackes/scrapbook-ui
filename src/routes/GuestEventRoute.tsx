import { PublicEventPage } from '../features/public-event/PublicEventPage'

export function isGuestRoute(pathname: string): boolean {
  return pathname === '/e' || pathname.startsWith('/e/')
}

export function GuestEventRoute({ pathname }: { pathname: string }) {
  const code = /^\/e\/([A-Za-z0-9_-]{43})$/.exec(pathname)?.[1]
  return <PublicEventPage key={code ?? pathname} code={code} />
}
