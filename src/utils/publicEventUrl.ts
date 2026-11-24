export function isPublicEventCode(value: unknown): value is string {
  return typeof value === 'string' && value.length === 43 && !/[^A-Za-z0-9_-]/.test(value)
}

export function publicEventUrl(code: string, configuredOrigin: string, currentOrigin: string): string | null {
  const origin = publicSiteOrigin(configuredOrigin, currentOrigin)
  return origin && isPublicEventCode(code) ? origin + '/e/' + code : null
}

export function publicSiteOrigin(configuredOrigin: string, currentOrigin: string): string | null {
  const origin = configuredOrigin || currentOrigin
  try {
    const source = new URL(origin)
    if (source.origin !== origin) return null
    const allowed = configuredOrigin
      ? /^https:\/\/([a-z0-9][a-z0-9-]*\.)+[a-z][a-z0-9-]*$/.test(origin)
      : (source.protocol === 'http:' || source.protocol === 'https:')
        && ['127.0.0.1', 'localhost', '[::1]'].includes(source.hostname)
    return allowed ? origin : null
  } catch {
    return null
  }
}
