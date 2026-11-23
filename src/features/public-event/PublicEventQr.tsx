import { QrCode } from '../../components/QrCode'
import { useQrCode } from '../../hooks/useQrCode'

export function PublicEventQr({ url }: { url: string }) {
  const qr = useQrCode(url)
  return (
    <section className="guest-share" aria-labelledby="guest-share-heading">
      <h2 id="guest-share-heading">Compartilhar com outro convidado</h2>
      {qr.kind === 'ready' && <QrCode matrix={qr.matrix} />}
      <p><a href={url}>{url}</a></p>
    </section>
  )
}
