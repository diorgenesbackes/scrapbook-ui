export const videoMultipartThresholdBytes = 32 * 1024 * 1024
export const videoPartSizeBytes = 16 * 1024 * 1024
export const maxVideoBytes = 500_000_000

export function videoPartCount(bytes: number) {
  return bytes >= videoMultipartThresholdBytes ? Math.ceil(bytes / videoPartSizeBytes) : 1
}
