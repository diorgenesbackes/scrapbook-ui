export function watchPageResume(refresh: () => void) {
  function resume() {
    if (!document.hidden) refresh()
  }

  function restore(event: PageTransitionEvent) {
    if (event.persisted) resume()
  }

  window.addEventListener('focus', resume)
  window.addEventListener('pageshow', restore)
  document.addEventListener('visibilitychange', resume)
  return () => {
    window.removeEventListener('focus', resume)
    window.removeEventListener('pageshow', restore)
    document.removeEventListener('visibilitychange', resume)
  }
}
