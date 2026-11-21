export function openEventOpeningChannel(): BroadcastChannel | null {
  return typeof BroadcastChannel === 'function' ? new BroadcastChannel('scrapbook-event-opening') : null
}

export function announceOpeningChange(eventId: string) {
  const channel = openEventOpeningChannel()
  channel?.postMessage(eventId)
  channel?.close()
}
