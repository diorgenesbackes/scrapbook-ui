import { expect, it } from 'vitest'
import { invitationUrl } from './invitationUrl'

const token = 'v1.test.' + 'A'.repeat(43)

it('mantém o token no fragmento da origem canônica, inclusive a partir de um alias', () => {
  expect(invitationUrl(token, 'https://events.example', 'https://other.example'))
    .toBe('https://events.example/convites/aceitar#' + token)
  expect(invitationUrl(token, '', 'http://127.0.0.1:5173'))
    .toBe('http://127.0.0.1:5173/convites/aceitar#' + token)
  expect(invitationUrl(token, '', 'https://other.example')).toBeNull()
})

it('recusa tokens alterados e os códigos públicos da F05', () => {
  expect(invitationUrl(token + '\n', 'https://events.example', '')).toBeNull()
  expect(invitationUrl('A'.repeat(43), 'https://events.example', '')).toBeNull()
  expect(invitationUrl(token + '?q=1', 'https://events.example', '')).toBeNull()
})
