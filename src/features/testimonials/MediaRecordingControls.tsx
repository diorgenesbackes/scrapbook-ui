import { useLayoutEffect, useRef } from 'react'
import type { MediaKind } from './mediaFiles'
import type { RecordingFailure } from './mediaRecording'
import type { useMediaRecording } from './useMediaRecording'

function failureMessage(failure: RecordingFailure, limit: string) {
  switch (failure) {
    case 'permission': return 'Permita o acesso no navegador ou selecione um arquivo do dispositivo.'
    case 'unsupported': return 'A gravação não está disponível neste navegador. Selecione um arquivo do dispositivo.'
    case 'interrupted': return 'Não foi possível preparar a prévia. Tente novamente ou escolha outro arquivo.'
    case 'size': return limit
  }
}

function LiveVideo({ stream }: { stream: MediaStream }) {
  const player = useRef<HTMLVideoElement>(null)
  useLayoutEffect(() => {
    const element = player.current
    if (!element) return
    element.srcObject = stream
    return () => { element.srcObject = null }
  }, [stream])
  return <video ref={player} aria-label="Prévia da câmera" className="contribution-player" muted playsInline autoPlay />
}

export function MediaRecordingControls({ kind, recording, selected, busy, limit }: {
  kind: MediaKind
  recording: ReturnType<typeof useMediaRecording>
  selected: boolean
  busy: boolean
  limit: string
}) {
  const { view, cancel, start, stop } = recording
  const stopButton = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => {
    if (view.kind === 'recording') stopButton.current?.focus()
  }, [view.kind])

  return (
    <>
      {!recording.active && (
        <button type="button" disabled={busy} onClick={() => void start(kind)}>
          {selected ? 'Refazer gravação' : kind === 'video' ? 'Gravar vídeo' : 'Gravar áudio'}
        </button>
      )}
      {view.kind === 'requesting' && (
        <>
          <p role="status">Aguardando permissão para gravar…</p>
          <button className="testimonial-secondary" type="button" onClick={cancel}>Cancelar gravação</button>
        </>
      )}
      {view.kind === 'recording' && (
        <div className="media-recording">
          {kind === 'video' && <LiveVideo stream={view.stream} />}
          <p role="status">Gravando…</p>
          <p>Tempo restante <span role="timer" aria-label="Tempo restante">{Math.floor(view.seconds / 60)}:{String(view.seconds % 60).padStart(2, '0')}</span></p>
          <button type="button" ref={stopButton} onClick={stop}>Parar gravação</button>
        </div>
      )}
      {view.kind === 'finishing' && <p role="status">Preparando gravação…</p>}
      {view.kind === 'failed' && <p role="alert" className="testimonial-error">{failureMessage(view.failure, limit)}</p>}
    </>
  )
}
