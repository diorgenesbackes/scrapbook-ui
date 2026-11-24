import { expect, it } from 'vitest'
import { detectMediaContainer, mediaLimits, reviewMedia, validateMediaDuration, validateMediaSize, type SelectedMedia } from './mediaFiles'

const text = (value: string) => new TextEncoder().encode(value)

function iso(brand: string, compatible: string) {
  const bytes = new Uint8Array(20)
  new DataView(bytes.buffer).setUint32(0, bytes.length)
  bytes.set(text('ftyp' + brand), 4)
  bytes.set(text(compatible), 16)
  return bytes
}

function ebml(type: string) {
  return Uint8Array.of(26, 69, 223, 163, 128 + 3 + type.length, 0x42, 0x82, 128 + type.length, ...text(type))
}

it('reconhece containers pelos bytes, independentemente da extensão', () => {
  expect(detectMediaContainer(iso('isom', 'mp41'), 100, 'video')).toBe('mp4')
  expect(detectMediaContainer(iso('qt  ', 'qt  '), 100, 'video')).toBe('mov')
  expect(detectMediaContainer(iso('qt  ', 'qt  '), 100, 'audio')).toBeNull()
  expect(detectMediaContainer(iso('M4A ', 'isom'), 100, 'audio')).toBe('m4a')
  expect(detectMediaContainer(iso('avif', 'isom'), 100, 'video')).toBeNull()
  expect(detectMediaContainer(Uint8Array.of(255, 251, 144, 0), 100, 'audio')).toBe('mp3')
  expect(detectMediaContainer(Uint8Array.of(...text('ID3'), 4, 0, 0, 0, 0, 0, 0, 255, 251, 144, 0), 100, 'audio')).toBe('mp3')
  expect(detectMediaContainer(text('RIFF0000WAVE'), 100, 'audio')).toBe('wav')
  expect(detectMediaContainer(text('OggS'), 100, 'audio')).toBe('ogg')
  expect(detectMediaContainer(text('OggS'), 100, 'video')).toBeNull()
  expect(detectMediaContainer(ebml('webm'), 100, 'audio')).toBe('webm')
  expect(detectMediaContainer(ebml('webm'), 100, 'video')).toBe('webm')
  expect(detectMediaContainer(ebml('matroska'), 100, 'video')).toBeNull()
  expect(detectMediaContainer(iso('isom', 'mp41'), 19, 'video')).toBeNull()
})

it('aplica os limites inclusivos e rejeita metadados sem duração positiva', () => {
  expect(mediaLimits('moment', 'video')).toEqual({ bytes: 500_000_000, seconds: 60 })
  expect(mediaLimits('testimonial', 'audio')).toEqual({ bytes: 50_000_000, seconds: 300 })
  expect(mediaLimits('testimonial', 'video')).toEqual({ bytes: 500_000_000, seconds: 300 })
  expect(validateMediaSize('testimonial', 'video', 500_000_000)).toBeNull()
  expect(validateMediaSize('testimonial', 'video', 500_000_001)).toBe('size')
  expect(validateMediaSize('testimonial', 'audio', 50_000_000)).toBeNull()
  expect(validateMediaSize('testimonial', 'audio', 50_000_001)).toBe('size')
  expect(validateMediaSize('moment', 'audio', 1)).toBe('format')
  expect(validateMediaSize('moment', 'video', 0)).toBe('empty')
  expect(validateMediaDuration('moment', 'video', 60)).toBeNull()
  expect(validateMediaDuration('moment', 'video', 60.001)).toBe('duration')
  expect(validateMediaDuration('testimonial', 'video', 300)).toBeNull()
  expect(validateMediaDuration('testimonial', 'audio', 300.001)).toBe('duration')
  expect(validateMediaDuration('testimonial', 'audio', Infinity)).toBe('metadata')
  expect(validateMediaDuration('testimonial', 'audio', NaN)).toBe('metadata')
  expect(validateMediaDuration('testimonial', 'audio', 0)).toBe('metadata')
})

it('preserva o arquivo original e metadados no contrato, mantendo a URL fora dele', () => {
  const file = new File(['a'], 'voz.wav')
  const media: SelectedMedia = { file, kind: 'audio', container: 'wav', sizeBytes: file.size, durationSeconds: 1.5, url: 'blob:local' }
  expect(reviewMedia('evento-A', 'testimonial', media, 'Legenda')).toEqual({
    eventCode: 'evento-A', category: 'testimonial', format: 'audio', media: { file, container: 'wav', sizeBytes: 1, durationSeconds: 1.5 }, caption: 'Legenda',
  })
  expect(reviewMedia('evento-A', 'moment', media, null)).toBeNull()
  expect(reviewMedia('evento-A', 'testimonial', media, '😀'.repeat(501))).toBeNull()
})
