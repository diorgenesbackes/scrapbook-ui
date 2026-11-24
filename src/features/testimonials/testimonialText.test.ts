import { expect, it } from 'vitest'
import { identifyContribution } from './guestContribution'
import { countContributionCharacters, fitContributionPaste, reviewTextTestimonial, testimonialTextLimit } from './testimonialText'

it('conta escalares Unicode e mantém o conteúdo original no contrato do evento', () => {
  expect(countContributionCharacters('a😀e\u0301\n')).toBe(5)
  const text = ' 🥂'.repeat(2499) + '\n!'
  expect(countContributionCharacters(text)).toBe(5000)
  expect(reviewTextTestimonial('evento-A', text)).toEqual({ eventCode: 'evento-A', category: 'testimonial', format: 'text', text })
  expect(reviewTextTestimonial('evento-A', text + '!')).toBeNull()
  expect(reviewTextTestimonial('evento-A', ' \r\n\t')).toBeNull()
})

it('aproveita a seleção ao truncar a colagem e preserva o trecho seguinte', () => {
  const prefix = 'a'.repeat(4996)
  const original = prefix + 'xZ!'
  expect(fitContributionPaste(original, prefix.length, prefix.length + 1, '😀\r\nABC', testimonialTextLimit)).toEqual({
    value: prefix + '😀\nZ!', caret: prefix.length + 3,
  })
  expect(fitContributionPaste(original, 0, 0, '😀', testimonialTextLimit)).toBeNull()
  expect(fitContributionPaste(original + '.', 0, 0, '😀', testimonialTextLimit)).toEqual({ value: original + '.', caret: 0 })
})

it('vincula a identificação da F06 somente ao mesmo evento', () => {
  const draft = reviewTextTestimonial('evento-A', 'Saúde!')
  if (!draft) throw new Error('A fixture precisa de texto revisável.')
  const identification = { eventCode: draft.eventCode, guestName: 'Ana', noticeCode: 'v1', acceptedAt: '2032-02-29T03:00:00.000Z' }
  expect(identifyContribution(draft, identification)).toEqual({ ...draft, identification })
  expect(identifyContribution(draft, { ...identification, eventCode: 'evento-B' })).toBeNull()
})
