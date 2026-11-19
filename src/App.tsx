import { environment } from './config/environment'
import { AppRoutes } from './routes/AppRoutes'

export function App() {
  return (
    <>
      <a className="skip-link" href="#conteudo">Ir para o conteúdo</a>
      <header className="site-header">
        <a className="wordmark" href="/">Scrap Book</a>
      </header>
      <AppRoutes pathname={window.location.pathname} diagnosticsEnabled={environment.diagnosticsEnabled} />
    </>
  )
}
