import { afterEach, expect, it, vi } from 'vitest'
import { encodeQrCode } from './qrCodeMatrix'
import { qrPng, qrSvg } from './qrCodeFiles'

const url = 'https://eventos.example/e/' + 'Q'.repeat(43)

afterEach(() => vi.restoreAllMocks())

it('usa uma matriz determinística com quatro módulos livres e exporta o mesmo tamanho no SVG', async () => {
  const matrix = encodeQrCode(url)
  expect(matrix).toEqual(encodeQrCode(url))
  expect(matrix.dark.length).toBeGreaterThan(0)
  expect(matrix.dark.every(({ x, y }) => x >= 4 && x < matrix.size - 4 && y >= 4 && y < matrix.size - 4)).toBe(true)
  const svg = qrSvg(matrix)
  expect(svg.type).toBe('image/svg+xml')
  expect(await svg.text()).toContain(`viewBox="0 0 ${matrix.size} ${matrix.size}"`)
})

it('exporta a matriz em PNG de pelo menos 1024 px com escala inteira', async () => {
  const fillRect = vi.fn()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect } as unknown as CanvasRenderingContext2D)
  const blob = new Blob(['fixture'], { type: 'image/png' })
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, finish, mime) {
    expect(this.width).toBeGreaterThanOrEqual(1024)
    expect(this.height).toBe(this.width)
    expect(mime).toBe('image/png')
    finish(blob)
  })

  const matrix = encodeQrCode(url)
  expect(await qrPng(matrix)).toBe(blob)
  const scale = Math.ceil(1024 / matrix.size)
  expect(fillRect.mock.calls.length).toBe(matrix.dark.length + 1)
  expect(fillRect).toHaveBeenNthCalledWith(1, 0, 0, matrix.size * scale, matrix.size * scale)
})
