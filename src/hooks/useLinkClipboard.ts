import { useRef, useState } from 'react'

export function useLinkClipboard(url: string) {
  const field = useRef<HTMLInputElement>(null)
  const [feedback, setFeedback] = useState('')

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setFeedback('Link copiado.')
    } catch {
      field.current?.focus()
      field.current?.select()
      setFeedback('Copie o endereço selecionado para compartilhá-lo.')
    }
  }

  return { field, feedback, copy }
}
