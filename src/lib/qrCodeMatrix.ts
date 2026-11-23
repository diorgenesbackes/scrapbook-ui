import qrcode from 'qrcode-generator'

export type QrCodeMatrix = { size: number; dark: ReadonlyArray<{ x: number; y: number }> }

const quietZone = 4

export function encodeQrCode(url: string): QrCodeMatrix {
  const qr = qrcode(0, 'M')
  qr.addData(url, 'Byte')
  qr.make()
  const modules = qr.getModuleCount()
  const dark = []
  for (let y = 0; y < modules; y += 1) {
    for (let x = 0; x < modules; x += 1) {
      if (qr.isDark(y, x)) dark.push({ x: x + quietZone, y: y + quietZone })
    }
  }
  return { size: modules + quietZone * 2, dark }
}
