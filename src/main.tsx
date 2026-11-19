import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ApplicationErrorBoundary } from './components/ApplicationErrorBoundary'
import './styles/global.css'

const root = document.getElementById('root')
if (!root) throw new Error('Elemento de composição indisponível.')

createRoot(root, { onCaughtError: () => console.error('Falha de renderização do Scrap Book.') }).render(
  <StrictMode>
    <ApplicationErrorBoundary>
      <App />
    </ApplicationErrorBoundary>
  </StrictMode>,
)
