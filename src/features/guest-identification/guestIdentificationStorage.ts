import type { GuestIdentification } from './GuestIdentificationForm'

function key(eventCode: string): string {
  return 'scrapbook:guest-identification:v1:' + eventCode
}

function parse(value: unknown, eventCode: string, noticeCode: string): GuestIdentification | null {
  if (typeof value !== 'object' || value === null) return null
  if (!('eventCode' in value) || value.eventCode !== eventCode || !('noticeCode' in value) || value.noticeCode !== noticeCode) return null
  if (!('guestName' in value) || typeof value.guestName !== 'string' || !value.guestName || value.guestName.trim() !== value.guestName) return null
  if (!('acceptedAt' in value) || typeof value.acceptedAt !== 'string') return null

  const instant = new Date(value.acceptedAt)
  if (!Number.isFinite(instant.getTime()) || instant.toISOString() !== value.acceptedAt) return null
  return { eventCode, noticeCode, guestName: value.guestName, acceptedAt: value.acceptedAt }
}

export function readGuestIdentification(eventCode: string, noticeCode: string): GuestIdentification | null {
  try {
    const item = window.localStorage.getItem(key(eventCode))
    return item === null ? null : parse(JSON.parse(item), eventCode, noticeCode)
  } catch {
    return null
  }
}

export function saveGuestIdentification(identification: GuestIdentification): boolean {
  try {
    window.localStorage.setItem(key(identification.eventCode), JSON.stringify(identification))
    return true
  } catch {
    return false
  }
}
