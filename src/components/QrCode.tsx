import { qrPath } from '../lib/qrCodeFiles'
import type { QrCodeMatrix } from '../lib/qrCodeMatrix'

export function QrCode({ matrix }: { matrix: QrCodeMatrix }) {
  const { size } = matrix
  return (
    <svg className="event-qr" role="img" aria-label="QR code da página dos convidados"
      viewBox={`0 0 ${size} ${size}`} width="192" height="192" shapeRendering="crispEdges">
      <rect width={size} height={size} fill="white" />
      <path d={qrPath(matrix)} fill="black" />
    </svg>
  )
}
