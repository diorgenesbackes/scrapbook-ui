import { expect, it } from 'vitest'
import { photoCountLimit, photoFormat, photoHeaderSize, photoSizeLimit, reviewPhotos, validatePhotoSize, type SelectedPhoto } from './photoFiles'

function imageBrands(major: string, ...compatible: string[]) {
  const bytes = new Uint8Array(16 + compatible.length * 4)
  new DataView(bytes.buffer).setUint32(0, bytes.length)
  bytes.set(new TextEncoder().encode('ftyp' + major), 4)
  bytes.set(new TextEncoder().encode(compatible.join('')), 16)
  return bytes
}

it('classifica os bytes de JPEG, PNG, HEIC e HEIF e rejeita outros formatos', () => {
  expect(photoFormat(Uint8Array.of(255, 216, 255))).toBe('jpeg')
  expect(photoFormat(Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10))).toBe('png')
  expect(photoFormat(imageBrands('heic', 'mif1'))).toBe('heic')
  expect(photoFormat(imageBrands('mif1', 'heix'))).toBe('heic')
  expect(photoFormat(imageBrands('mif1'))).toBe('heif')
  expect(photoFormat(imageBrands('msf1'))).toBe('heif')
  expect(photoFormat(imageBrands('avif', 'mif1'))).toBeNull()
  expect(photoFormat(imageBrands('mif1', 'avis'))).toBeNull()
  expect(photoFormat(imageBrands('mp42'))).toBeNull()
  expect(photoFormat(new TextEncoder().encode('<svg />'))).toBeNull()
})

it('recusa caixas ftyp truncadas ou com tamanho inválido', () => {
  const bytes = imageBrands('mif1', 'heic', 'msf1')
  expect(photoHeaderSize(bytes.subarray(0, 16), bytes.length)).toBe(bytes.length)
  expect(photoFormat(bytes.subarray(0, 16))).toBeNull()
  new DataView(bytes.buffer).setUint32(0, 17)
  expect(photoFormat(bytes)).toBeNull()
})

it('aplica o limite decimal de bytes e as quantidades por categoria', () => {
  expect(photoCountLimit('testimonial')).toBe(1)
  expect(photoCountLimit('moment')).toBe(10)
  expect(validatePhotoSize(0)).toBe('empty')
  expect(validatePhotoSize(20_000_000)).toBeNull()
  expect(validatePhotoSize(20_000_001)).toBe('size')
})

it('mantém a ordem dos Files originais e emite legenda única sem URLs locais', () => {
  const first = new File(['abc'], 'primeira.jpg')
  const second = new File(['def'], 'segunda.png')
  const photos: SelectedPhoto[] = [
    { id: 2, url: 'blob:primeira', file: first, format: 'jpeg', sizeBytes: first.size },
    { id: 1, url: 'blob:segunda', file: second, format: 'png', sizeBytes: second.size },
  ]
  expect(reviewPhotos('evento', 'moment', photos, '  Legenda!  ')).toEqual({
    eventCode: 'evento', category: 'moment', format: 'photo', caption: '  Legenda!  ',
    photos: [{ file: first, format: 'jpeg', sizeBytes: first.size }, { file: second, format: 'png', sizeBytes: second.size }],
  })
  expect(reviewPhotos('evento', 'moment', photos, '  ')?.caption).toBeNull()
  expect(reviewPhotos('evento', 'moment', photos, '😀'.repeat(500))?.caption).toHaveLength(1000)
  expect(reviewPhotos('evento', 'testimonial', photos, null)).toBeNull()
  expect(reviewPhotos('evento', 'moment', [], null)).toBeNull()
  expect(reviewPhotos('evento', 'moment', photos, '😀'.repeat(501))).toBeNull()
  expect(reviewPhotos('evento', 'moment', photos.map(photo => ({ ...photo, sizeBytes: photoSizeLimit + 1 })), null)).toBeNull()
})
