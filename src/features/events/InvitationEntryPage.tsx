import { useEffect, useState } from 'react'
import { isInvitationToken } from '../../utils/invitationUrl'

export function InvitationEntryPage() {
  const [hasInvitation] = useState(() => isInvitationToken(window.location.hash.slice(1)))

  useEffect(() => {
    if (window.location.hash && window.location.hash !== '#conteudo') {
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
    }
  }, [])

  return (
    <main id="conteudo" className="main event-page" tabIndex={-1}>
      <h1>Convite para administrar um evento</h1>
      <p>{hasInvitation
        ? 'O aceite deste convite será feito com uma conta de e-mail confirmado.'
        : 'Este convite não está disponível. Solicite um novo.'}</p>
      <a href="/">Voltar ao início</a>
    </main>
  )
}
