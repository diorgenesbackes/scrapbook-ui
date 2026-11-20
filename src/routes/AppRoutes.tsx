import { HomePage } from '../pages/home/HomePage'

export function AppRoutes({ pathname, diagnosticsEnabled }: {
  pathname: string
  diagnosticsEnabled: boolean
}) {
  if (pathname === '/') return <HomePage diagnosticsEnabled={diagnosticsEnabled} />
  return (
    <main id="conteudo" className="main" tabIndex={-1}>
      <h1>Página indisponível</h1>
      <a href="/">Voltar ao início</a>
    </main>
  )
}
