import type { GuestIdentification } from '../guest-identification/GuestIdentificationForm'

export const testimonialTextLimit = 5000
export const testimonialTextError = 'Escreva um depoimento de até 5.000 caracteres.'

export type ReviewedTextTestimonial = Readonly<{
  eventCode: string
  category: 'testimonial'
  format: 'text'
  text: string
}>

export type IdentifiedTextTestimonial = ReviewedTextTestimonial & Readonly<{ identification: GuestIdentification }>

export function countContributionCharacters(text: string): number {
  return Array.from(text).length
}

export function fitTestimonialPaste(text: string, start: number, end: number, paste: string) {
  const prefix = text.slice(0, start)
  const suffix = text.slice(end)
  const slots = testimonialTextLimit - countContributionCharacters(prefix + suffix)
  const insertion = Array.from(paste.replace(/\r\n?/g, '\n'))
  if (insertion.length <= slots) return null
  const accepted = insertion.slice(0, Math.max(0, slots)).join('')
  return { value: prefix + accepted + suffix, caret: prefix.length + accepted.length }
}

export function reviewTextTestimonial(eventCode: string, text: string): ReviewedTextTestimonial | null {
  if (!text.trim() || countContributionCharacters(text) > testimonialTextLimit) return null
  return { eventCode, category: 'testimonial', format: 'text', text }
}

export function identifyTextTestimonial(contribution: ReviewedTextTestimonial, identification: GuestIdentification): IdentifiedTextTestimonial | null {
  if (contribution.eventCode !== identification.eventCode) return null
  return { ...contribution, identification }
}
