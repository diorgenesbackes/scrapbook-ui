export function readSubmissionUploadOrigin(value: string | undefined, diagnosticsEnabled: boolean): string {
  if (!value) return ''
  if (/^https:\/\/([a-z0-9][a-z0-9-]*\.)+[a-z][a-z0-9-]*$/.test(value)) return value
  if (diagnosticsEnabled && /^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(value)) {
    const port = Number(value.split(':').at(-1))
    if (port !== 80 && port <= 65535) return value
  }
  return ''
}
