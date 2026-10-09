import { expect, test } from 'claude-code/testing'

import { normalize } from '../hooks/register'

test('A snapshot from an older version gets every field, no NaN', () => {
  // Version 1.0 stored no othersUsd; adding to undefined gave NaN in the Value row.
  const old = { limits: [], usd: 4.2, baseUsd: 1, tokens: 10, baseTokens: 5, now: 1 }
  const s = normalize(old)
  expect(s.othersUsd).toBe(0)
  expect(s.othersUsd + (s.usd ?? 0)).toBe(4.2)
})

test('Missing or broken values fall back to safe defaults', () => {
  expect(normalize(undefined)).toEqual({
    limits: [],
    usd: null,
    baseUsd: 0,
    tokens: 0,
    baseTokens: 0,
    othersUsd: 0,
    now: 0,
  })
  expect(normalize({ usd: Number.NaN, tokens: Number.NaN }).usd).toBe(null)
  expect(normalize({ usd: Number.NaN, tokens: Number.NaN }).tokens).toBe(0)
})
