import { Component, type ReactNode } from 'react'

export class ApplicationErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <main className="main" tabIndex={-1} ref={element => { element?.focus() }}>
        <h1>Serviço temporariamente indisponível</h1>
        <p>Tente novamente em instantes.</p>
        <button type="button" onClick={() => this.setState({ failed: false })}>Tentar novamente</button>
      </main>
    )
  }
}
