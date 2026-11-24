import type { GuestIdentification } from '../guest-identification/GuestIdentificationForm'

export type ContributionCategory = 'testimonial' | 'moment'
export const mediaCaptionLimit = 500

export function identifyContribution<T extends { eventCode: string }>(contribution: T, identification: GuestIdentification) {
  if (contribution.eventCode !== identification.eventCode) return null
  return { ...contribution, identification }
}
