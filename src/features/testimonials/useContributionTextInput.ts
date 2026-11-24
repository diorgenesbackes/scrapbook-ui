import { useLayoutEffect, useRef, useState, type ClipboardEvent } from 'react'
import { countContributionCharacters, fitContributionPaste } from './testimonialText'

export function useContributionTextInput(text: string, onTextChange: (text: string) => void, limit: number) {
  const input = useRef<HTMLTextAreaElement>(null)
  const pendingCaret = useRef<number | null>(null)
  const [limited, setLimited] = useState(false)
  const remaining = limit - countContributionCharacters(text)

  useLayoutEffect(() => {
    const caret = pendingCaret.current
    if (caret === null) return
    input.current?.setSelectionRange(caret, caret)
    pendingCaret.current = null
  }, [text])

  function change(value: string) {
    const overflow = countContributionCharacters(value) > limit
    setLimited(overflow)
    if (!overflow) onTextChange(value)
  }

  function paste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const field = event.currentTarget
    const fitted = fitContributionPaste(text, field.selectionStart, field.selectionEnd, event.clipboardData.getData('text/plain'), limit)
    if (!fitted) return
    event.preventDefault()
    if (fitted.value !== text) {
      pendingCaret.current = fitted.caret
      onTextChange(fitted.value)
    }
    setLimited(true)
  }

  return { input, remaining, limited, change, paste }
}
