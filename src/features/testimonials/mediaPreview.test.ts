import { afterEach, expect, it, vi } from 'vitest'
import { probeMedia } from './mediaPreview'

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

function player(duration: number, width: number) {
  const element = document.createElement('video')
  Object.defineProperties(element, { duration: { value: duration }, videoWidth: { value: width } })
  const unload = vi.spyOn(element, 'load').mockImplementation(() => undefined)
  vi.spyOn(document, 'createElement').mockReturnValue(element)
  return { element, unload }
}

it('espera dados decodificados, devolve a duração e libera o elemento temporário', async () => {
  const { element, unload } = player(60, 32)
  const probe = probeMedia('blob:local', 'video', 'moment', new AbortController().signal)
  element.dispatchEvent(new Event('loadedmetadata'))
  expect(element.getAttribute('src')).toBe('blob:local')
  element.dispatchEvent(new Event('loadeddata'))
  await expect(probe).resolves.toEqual({ kind: 'ready', durationSeconds: 60 })
  expect(element.getAttribute('src')).toBeNull()
  expect(unload).toHaveBeenCalledOnce()
})

it.each([
  [60.01, 32, 'duration'], [Infinity, 32, 'metadata'], [1, 0, 'format'],
])('recusa metadados de vídeo incompatíveis para duração %s e largura %s', async (duration, width, issue) => {
  const { element } = player(duration, width)
  const probe = probeMedia('blob:local', 'video', 'moment', new AbortController().signal)
  element.dispatchEvent(new Event('loadedmetadata'))
  await expect(probe).resolves.toEqual({ kind: 'failed', issue })
  expect(element.getAttribute('src')).toBeNull()
})

it('cancela a leitura e libera a prévia ao sair', async () => {
  const { element, unload } = player(2, 0)
  const controller = new AbortController()
  const probe = probeMedia('blob:local', 'audio', 'testimonial', controller.signal)
  controller.abort()
  await expect(probe).resolves.toEqual({ kind: 'cancelled' })
  expect(element.getAttribute('src')).toBeNull()
  expect(unload).toHaveBeenCalledOnce()
})

it('oferece recuperação quando o navegador não conclui a prévia', async () => {
  vi.useFakeTimers()
  const { element } = player(2, 0)
  const result = probeMedia('blob:local', 'audio', 'testimonial', new AbortController().signal)
  vi.advanceTimersByTime(15_000)
  await expect(result).resolves.toEqual({ kind: 'failed', issue: 'preview' })
  expect(element.getAttribute('src')).toBeNull()
})
