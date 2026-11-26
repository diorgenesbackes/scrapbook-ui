import { submissionChecksum } from './submissionChecksum'

export async function photoChecksum(file: File, signal: AbortSignal): Promise<string | null> {
  return (await submissionChecksum(file, null, signal))?.sha256 ?? null
}
