import type { ContributionCategory } from './guestContribution'
import { countContributionCharacters } from './testimonialText'

export const photoSizeLimit = 20_000_000
export const photoCaptionLimit = 500
export const photoAccept = 'image/jpeg,image/png,image/heic,image/heif,.jpg,.jpeg,.png,.heic,.heif'

export type PhotoFormat = 'jpeg' | 'png' | 'heic' | 'heif'
export type PhotoIssue = 'empty' | 'size' | 'format' | 'preview' | 'quantity'
export type PhotoFile = Readonly<{ file: File; format: PhotoFormat; sizeBytes: number }>
export type SelectedPhoto = PhotoFile & Readonly<{ id: number; url: string }>

export type ReviewedPhotos = Readonly<{
  eventCode: string
  category: ContributionCategory
  format: 'photo'
  photos: readonly PhotoFile[]
  caption: string | null
}>

const png = [137, 80, 78, 71, 13, 10, 26, 10]
function fourCC(value: string) {
  return value.charCodeAt(0) * 0x1000000 + value.charCodeAt(1) * 0x10000 + value.charCodeAt(2) * 0x100 + value.charCodeAt(3)
}

const heicBrands = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs'].map(fourCC))
const heifBrands = new Set(['mif1', 'msf1'].map(fourCC))
const avifBrands = new Set(['avif', 'avis'].map(fourCC))

function brandAt(bytes: Uint8Array, offset: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4))
}

export function photoHeaderSize(bytes: Uint8Array, size: number) {
  if (bytes.length < 16 || brandAt(bytes, 4) !== 'ftyp') return 0
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0)
  return length >= 16 && length <= size && length % 4 === 0 ? length : 0
}

export function photoFormat(bytes: Uint8Array): PhotoFormat | null {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpeg'
  if (png.every((byte, i) => bytes[i] === byte)) return 'png'

  const size = photoHeaderSize(bytes, bytes.length)
  if (!size) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const major = view.getUint32(8)
  if (avifBrands.has(major)) return null
  let heic = heicBrands.has(major)
  let heif = heifBrands.has(major)
  for (let offset = 16; offset < size; offset += 4) {
    const brand = view.getUint32(offset)
    if (avifBrands.has(brand)) return null
    heic ||= heicBrands.has(brand)
    heif ||= heifBrands.has(brand)
  }
  if (heic) return 'heic'
  return heif ? 'heif' : null
}

export function photoCountLimit(category: ContributionCategory) {
  return category === 'testimonial' ? 1 : 10
}

export function validatePhotoSize(bytes: number): 'empty' | 'size' | null {
  if (bytes === 0) return 'empty'
  return bytes > photoSizeLimit ? 'size' : null
}

export async function readPhoto(file: File): Promise<PhotoFormat | PhotoIssue> {
  const issue = validatePhotoSize(file.size)
  if (issue) return issue
  try {
    const header = new Uint8Array(await file.slice(0, 32).arrayBuffer())
    const size = photoHeaderSize(header, file.size)
    const bytes = size > header.length ? new Uint8Array(await file.slice(0, size).arrayBuffer()) : header
    return photoFormat(bytes) ?? 'format'
  } catch {
    return 'preview'
  }
}

export function reviewPhotos(eventCode: string, category: ContributionCategory, photos: readonly SelectedPhoto[], caption: string | null): ReviewedPhotos | null {
  if (photos.length === 0 || photos.length > photoCountLimit(category)
      || photos.some(photo => validatePhotoSize(photo.sizeBytes))
      || (caption !== null && countContributionCharacters(caption) > photoCaptionLimit)) return null
  return {
    eventCode,
    category,
    format: 'photo',
    photos: photos.map(({ file, format, sizeBytes }) => ({ file, format, sizeBytes })),
    caption: caption?.trim() ? caption : null,
  }
}
