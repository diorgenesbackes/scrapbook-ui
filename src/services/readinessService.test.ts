import { afterEach, expect, it, vi } from 'vitest'
import { checkReadiness } from './readinessService'

afterEach(() => vi.unstubAllGlobals())

it.each([
  [Response.json({ status: 'up' }), true],
  [Response.json({ status: 'down' }), false],
  [Response.json(null), false],
  [Response.json({ status: 'up' }, { status: 503 }), false],
])('classifies readiness using status and payload', async (response, expected) => {
  const signal = new AbortController().signal
  const fetch = vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetch)
  await expect(checkReadiness(signal)).resolves.toBe(expected)
  expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/health\/ready$/), {
    headers: { Accept: 'application/json' }, cache: 'no-store', signal,
  })
})
