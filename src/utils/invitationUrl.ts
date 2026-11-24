import { publicSiteOrigin } from './publicEventUrl'

export const invitationEntryPath = '/convites/aceitar'

export function isInvitationToken(value: unknown): value is string {
  return typeof value === 'string' && /^v1\.[A-Za-z0-9_-]{1,64}\.[A-Za-z0-9_-]{43}$/.test(value)
    && !/[^A-Za-z0-9_.-]/.test(value)
}

export function invitationUrl(token: string, configuredOrigin: string, currentOrigin: string): string | null {
  const origin = publicSiteOrigin(configuredOrigin, currentOrigin)
  return origin && isInvitationToken(token) ? origin + invitationEntryPath + '#' + token : null
}
