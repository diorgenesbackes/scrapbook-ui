import { GuestIdentificationPreview } from '../features/guest-identification/GuestIdentificationPreview'
import { localGuestAccessNotice } from '../features/guest-identification/localGuestAccessNotice'
import { PublicEventPage } from '../features/public-event/PublicEventPage'
import { TextTestimonialPage } from '../features/testimonials/TextTestimonialPage'

export function isGuestRoute(pathname: string): boolean {
  return pathname === '/e' || pathname.startsWith('/e/')
}

export function GuestEventRoute({ pathname }: { pathname: string }) {
  const testimonialCode = /^\/e\/([A-Za-z0-9_-]{43})\/depoimento$/.exec(pathname)?.[1]
  if (import.meta.env.VITE_ENABLE_LOCAL_DIAGNOSTICS === 'true' && ['127.0.0.1', 'localhost', '[::1]'].includes(window.location.hostname)) {
    if (testimonialCode) {
      return <TextTestimonialPage key={testimonialCode} eventCode={testimonialCode} notice={localGuestAccessNotice} />
    }
    const preview = /^\/e\/([A-Za-z0-9_-]{43})\/identificacao(?:\/(depoimento|momento))?$/.exec(pathname)
    const previewCode = preview?.[1]
    if (previewCode) {
      const category = preview?.[2]
      return <GuestIdentificationPreview key={pathname} eventCode={previewCode}
        category={category === 'depoimento' || category === 'momento' ? category : undefined} />
    }
  }
  if (testimonialCode) return <TextTestimonialPage key={testimonialCode} eventCode={testimonialCode} />
  const code = /^\/e\/([A-Za-z0-9_-]{43})$/.exec(pathname)?.[1]
  return <PublicEventPage key={code ?? pathname} code={code} />
}
