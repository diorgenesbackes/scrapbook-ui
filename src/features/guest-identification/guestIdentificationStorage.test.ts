import { afterEach, describe, expect, it, vi } from 'vitest'
import { readGuestIdentification, saveGuestIdentification } from './guestIdentificationStorage'

const identification = { eventCode: 'A'.repeat(43), guestName: 'Tati de Sá', noticeCode: 'aviso-v1', acceptedAt: '2032-02-29T03:00:00.000Z' }
const key = 'scrapbook:guest-identification:v1:' + identification.eventCode

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

it('reutiliza o registro só quando o evento e a versão correspondem', () => {
  expect(saveGuestIdentification(identification)).toBe(true)
  expect(readGuestIdentification(identification.eventCode, identification.noticeCode)).toEqual(identification)
  expect(readGuestIdentification('B'.repeat(43), identification.noticeCode)).toBeNull()
  expect(readGuestIdentification(identification.eventCode, 'aviso-v2')).toBeNull()
})

describe('registros incompletos ou incompatíveis', () => {
  it.each([
    '{', 'null', 'true', '{}',
    JSON.stringify({ ...identification, eventCode: 'B'.repeat(43) }),
    JSON.stringify({ ...identification, guestName: '' }),
    JSON.stringify({ ...identification, guestName: '  Tati  ' }),
    JSON.stringify({ ...identification, guestName: 42 }),
    JSON.stringify({ ...identification, acceptedAt: null }),
    JSON.stringify({ ...identification, acceptedAt: '2032-02-30T03:00:00.000Z' }),
    JSON.stringify({ ...identification, acceptedAt: 'inválido' }),
  ])('exige nova identificação para %s', item => {
    localStorage.setItem(key, item)
    expect(readGuestIdentification(identification.eventCode, identification.noticeCode)).toBeNull()
  })
})

it('trata leitura e escrita separadamente quando o navegador as bloqueia', () => {
  const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Bloqueado', 'SecurityError') })
  expect(readGuestIdentification(identification.eventCode, identification.noticeCode)).toBeNull()
  expect(saveGuestIdentification(identification)).toBe(true)
  get.mockRestore()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Cheio', 'QuotaExceededError') })
  expect(saveGuestIdentification({ ...identification, guestName: 'Ana' })).toBe(false)
  expect(readGuestIdentification(identification.eventCode, identification.noticeCode)).toEqual(identification)
})

it('recupera quando o navegador recusa acesso ao armazenamento', () => {
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('Bloqueado', 'SecurityError') })
  expect(readGuestIdentification(identification.eventCode, identification.noticeCode)).toBeNull()
  expect(saveGuestIdentification(identification)).toBe(false)
})
