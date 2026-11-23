import { expect, it } from 'vitest'
import { publicEventUrl } from './publicEventUrl'

const code = '_lv5Uj97Qkq7kckeOtjXoY3jHviZqegNrKxNPEp8yXQ'

it('usa a origem publicada, inclusive quando a interface abre por um alias', () => {
  expect(publicEventUrl(code, 'https://eventos.example', 'https://alias.example')).toBe('https://eventos.example/e/' + code)
  expect(publicEventUrl(code, 'https://eventos.hlg.example', 'https://alias.example')).toBe('https://eventos.hlg.example/e/' + code)
})

it('usa somente uma origem loopback quando não há configuração publicada', () => {
  expect(publicEventUrl(code, '', 'http://127.0.0.1:5173')).toBe('http://127.0.0.1:5173/e/' + code)
  expect(publicEventUrl(code, '', 'http://[::1]:5173')).toBe('http://[::1]:5173/e/' + code)
  expect(publicEventUrl(code, '', 'https://alias.example')).toBeNull()
})

it.each(['https://eventos.example/', 'https://eventos.example/path', 'https://eventos.example?query',
  'http://eventos.example', 'https://host@eventos.example', 'https://127.0.0.1', 'config-invalida'])(
  'recusa origem publicada inválida %s', origin => {
    expect(publicEventUrl(code, origin, 'http://127.0.0.1:5173')).toBeNull()
  })

it('recusa um código adulterado', () => {
  expect(publicEventUrl('A'.repeat(42) + '\n', 'https://eventos.example', '')).toBeNull()
  expect(publicEventUrl(code + '/lembrancas', 'https://eventos.example', '')).toBeNull()
})
