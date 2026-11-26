import { useMediaSubmission } from './useMediaSubmission'

export type { MediaSubmissionView as VideoSubmissionView } from './useMediaSubmission'

export function useVideoSubmission(eventCode: string, onConfirmed: () => void) {
  return useMediaSubmission(eventCode, 'video', onConfirmed)
}
