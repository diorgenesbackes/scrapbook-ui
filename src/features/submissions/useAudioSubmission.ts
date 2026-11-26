import { useMediaSubmission } from './useMediaSubmission'

export function useAudioSubmission(eventCode: string, onConfirmed: () => void) {
  return useMediaSubmission(eventCode, 'audio', onConfirmed)
}
