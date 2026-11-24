import { qrPath } from '../lib/qrCodeFiles'
import type { QrCodeMatrix } from '../lib/qrCodeMatrix'

export function QrCode({ matrix, label = 'QR code da página dos convidados' }: { matrix: QrCodeMatrix; label?: string }) {
  const { size } = matrix
  return (
    <svg className="event-qr" role="img" aria-label={label}
      viewBox={`0 0 ${size} ${size}`} width="192" height="192" shapeRendering="crispEdges">
      <rect width={size} height={size} fill="white" />
      <path d={qrPath(matrix)} fill="black" />
    </svg>
  )
}
