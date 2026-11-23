import type { QrCodeMatrix } from './qrCodeMatrix'

export function qrPath(matrix: QrCodeMatrix): string {
  return matrix.dark.map(({ x, y }) => `M${x} ${y}h1v1h-1z`).join('')
}

export function qrSvg(matrix: QrCodeMatrix): Blob {
  const { size } = matrix
  const image = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">`
    + `<rect width="${size}" height="${size}" fill="white"/><path d="${qrPath(matrix)}" fill="black"/></svg>`
  return new Blob([image], { type: 'image/svg+xml' })
}

export function qrPng(matrix: QrCodeMatrix): Promise<Blob> {
  const canvas = document.createElement('canvas')
  const scale = Math.ceil(1024 / matrix.size)
  canvas.width = canvas.height = matrix.size * scale
  const context = canvas.getContext('2d')
  if (!context) return Promise.reject(new Error('Canvas indisponível.'))

  context.fillStyle = 'white'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = 'black'
  for (const { x, y } of matrix.dark) context.fillRect(x * scale, y * scale, scale, scale)

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('Imagem indisponível.'))
    }, 'image/png')
  })
}

export function downloadQrCode(blob: Blob, extension: 'png' | 'svg') {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'qr-convidados.' + extension
  document.body.append(anchor)
  try {
    anchor.click()
  } finally {
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
  }
}
