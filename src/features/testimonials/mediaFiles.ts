import { maxVideoBytes } from '../submissions/videoParts'
import { mediaCaptionLimit, type ContributionCategory } from './guestContribution'
import { countContributionCharacters } from './testimonialText'

export type MediaKind = 'audio' | 'video'
export type MediaContainer = 'mp4' | 'mov' | 'webm' | 'mp3' | 'm4a' | 'wav' | 'ogg'
export type MediaIssue = 'empty' | 'size' | 'format' | 'metadata' | 'duration' | 'preview'

export type ReviewedMedia = Readonly<{
  eventCode: string
  category: ContributionCategory
  format: MediaKind
  media: Readonly<{ file: File; container: MediaContainer; sizeBytes: number; durationSeconds: number }>
  caption: string | null
}>

export type SelectedMedia = ReviewedMedia['media'] & Readonly<{ kind: MediaKind; url: string }>

const headerLimit = 65_536
const isoBrands = new Set(['isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'iso7', 'iso8', 'iso9', 'mp41', 'mp42', 'avc1', 'dash', 'M4A ', 'M4V ', 'MSNV'])
const isoPadding = new Set(['free', 'skip', 'wide'])

export const mediaAccept = {
  video: 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm',
  audio: 'audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,audio/ogg,audio/webm,.mp3,.m4a,.wav,.ogg,.webm',
}

export function mediaLimits(category: ContributionCategory, kind: MediaKind) {
  return { bytes: kind === 'audio' ? 50_000_000 : maxVideoBytes, seconds: category === 'moment' ? 60 : 300 }
}

export function validateMediaSize(category: ContributionCategory, kind: MediaKind, bytes: number): MediaIssue | null {
  if (category === 'moment' && kind === 'audio') return 'format'
  if (bytes === 0) return 'empty'
  return bytes > mediaLimits(category, kind).bytes ? 'size' : null
}

export function validateMediaDuration(category: ContributionCategory, kind: MediaKind, duration: number): MediaIssue | null {
  if (!Number.isFinite(duration) || duration <= 0) return 'metadata'
  return duration > mediaLimits(category, kind).seconds ? 'duration' : null
}

function word(bytes: Uint8Array, index: number, length = 4) {
  return String.fromCharCode(...bytes.subarray(index, index + length))
}

function vint(bytes: Uint8Array, index: number, preserveMarker: boolean) {
  const lead = bytes[index]
  if (!lead) return null
  let marker = 128
  let length = 1
  while (!(lead & marker)) { marker >>= 1; length++ }
  if (index + length > bytes.length) return null
  let value = preserveMarker ? lead : lead & (marker - 1)
  for (let i = 1; i < length; i++) value = value * 256 + (bytes[index + i] ?? 0)
  return Number.isSafeInteger(value) ? { value, length } : null
}

function isWebm(bytes: Uint8Array) {
  const header = vint(bytes, 4, false)
  if (!header) return false
  let offset = 4 + header.length
  const end = offset + header.value
  if (end > bytes.length) return false
  while (offset < end) {
    const id = vint(bytes, offset, true)
    if (!id) return false
    const size = vint(bytes, offset + id.length, false)
    if (!size) return false
    offset += id.length + size.length
    if (offset + size.value > end) return false
    if (id.value === 0x4282) return size.value === 4 && word(bytes, offset) === 'webm'
    offset += size.value
  }
  return false
}

function isoContainer(bytes: Uint8Array, fileSize: number, kind: MediaKind): MediaContainer | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 0
  while (offset + 8 <= bytes.length) {
    const size = view.getUint32(offset)
    const type = word(bytes, offset + 4)
    if (size < 8 || offset + size > fileSize) return null
    if (isoPadding.has(type)) { offset += size; continue }
    if (kind === 'video' && (type === 'mdat' || type === 'moov')) return 'mov'
    if (type !== 'ftyp' || size < 16 || size % 4 !== 0 || offset + size > bytes.length) return null
    const major = word(bytes, offset + 8)
    if (major === 'qt  ') return kind === 'video' ? 'mov' : null
    let known = isoBrands.has(major)
    const brands = [major]
    for (let i = offset + 16; i < offset + size; i += 4) brands.push(word(bytes, i))
    if (brands.some(brand => /^(avif|avis|mif1|msf1|hei.|hev.)$/.test(brand))) return null
    known ||= brands.some(brand => isoBrands.has(brand))
    return known ? (kind === 'audio' ? 'm4a' : 'mp4') : null
  }
  return null
}

function isMp3(bytes: Uint8Array, index: number) {
  const second = bytes[index + 1] ?? 0
  const third = bytes[index + 2] ?? 0
  return bytes[index] === 255 && (second & 0xe0) === 0xe0 && (second & 0x18) !== 0x08
    && (second & 0x06) === 0x02 && (third & 0xf0) !== 0xf0 && (third & 0x0c) !== 0x0c
}

function mp3Start(bytes: Uint8Array) {
  if (word(bytes, 0, 3) !== 'ID3' || bytes.length < 10) return 0
  const size = Array.from(bytes.subarray(6, 10))
  if (size.some(byte => byte >= 128)) return 0
  return 10 + size.reduce((value, byte) => value * 128 + byte, 0) + ((bytes[3] === 4 && ((bytes[5] ?? 0) & 16)) ? 10 : 0)
}

export function detectMediaContainer(bytes: Uint8Array, fileSize: number, kind: MediaKind): MediaContainer | null {
  if (bytes.length < 4) return null
  const signature = word(bytes, 0)
  if (signature === '\x1a\x45\xdf\xa3') return isWebm(bytes) ? 'webm' : null
  if (kind === 'audio') {
    if (signature === 'OggS') return 'ogg'
    if (['RIFF', 'RIFX', 'RF64'].includes(signature) && word(bytes, 8) === 'WAVE') return 'wav'
    if (isMp3(bytes, mp3Start(bytes))) return 'mp3'
  }
  return isoContainer(bytes, fileSize, kind)
}

export async function readMediaContainer(file: File, kind: MediaKind): Promise<MediaContainer | null> {
  const bytes = new Uint8Array(await file.slice(0, headerLimit).arrayBuffer())
  if (kind === 'audio') {
    const start = mp3Start(bytes)
    if (start + 4 > bytes.length && start + 4 <= file.size) {
      const frame = new Uint8Array(await file.slice(start, start + 4).arrayBuffer())
      if (isMp3(frame, 0)) return 'mp3'
    }
  }
  return detectMediaContainer(bytes, file.size, kind)
}

export function mediaMime(container: MediaContainer, kind: MediaKind) {
  if (container === 'webm') return kind + '/webm'
  return { mp4: 'video/mp4', mov: 'video/quicktime', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg' }[container]
}

export function reviewMedia(eventCode: string, category: ContributionCategory, selected: SelectedMedia, caption: string | null): ReviewedMedia | null {
  const { kind, file, container, sizeBytes, durationSeconds } = selected
  if (validateMediaSize(category, kind, sizeBytes) || validateMediaDuration(category, kind, durationSeconds)
      || (caption !== null && countContributionCharacters(caption) > mediaCaptionLimit)) return null
  return { eventCode, category, format: kind, media: { file, container, sizeBytes, durationSeconds }, caption: caption?.trim() ? caption : null }
}
