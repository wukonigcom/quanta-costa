import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { mergeWeekBase, perPercent, resetText, weekAdded } from '../hooks/register'

const BAND = {
  plugin: 'quanta-costa',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 110,
    scroll: { offset: 0, bodyRows: 19 },
    view: {},
  },
} as const

const NOW = Date.parse('2026-10-09T12:00:00Z')
const RESET = '2026-10-12T12:00:00Z'
const NEXT_RESET = '2026-10-19T12:00:00Z'

const world = (on: On, files: Record<string, string> = {}) => {
  const name = (path: string) => path.replace(/^.*[\\/]/, '')
  mock.clock(on, { now: NOW })
  mock.env(on, { USERPROFILE: 'C:/Users/test' })
  mock.store(on)
  on('fs.read', ($, e) => ({ value: files[name(e.path)] ?? '' }))
  on('fs.write', ($, e) => {
    files[name(e.path)] = e.text
    return { value: undefined }
  })
  on('session.id', () => ({ value: 'this-session' }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  return files
}

test('The week resets with weekday and time, like the Claude app; further off with the date', () => {
  expect(resetText(Date.parse(RESET), NOW, 'en')).toMatch(/^Mon \d\d:\d\d$/)
  expect(resetText(Date.parse(RESET), NOW, 'de')).toMatch(/^Mo \d\d:\d\d$/)
  expect(resetText(Date.parse('2026-11-29T12:00:00Z'), NOW, 'en')).toBe('Nov 29')
  expect(resetText(Date.parse('2026-11-29T12:00:00Z'), NOW, 'de')).toBe('29.11.')
})

test('Value per percent: what the week added, divided by the points used since the first look', () => {
  const base = { resetsAt: Date.parse(RESET), percent: 10, values: { '2026-09-29': 100 } }
  // $60 more in the old period, and a new period that began this week with $40.
  expect(weekAdded(base, { '2026-09-29': 160, '2026-10-29': 40 })).toBe(100)
  expect(perPercent(100, 4)).toBe(25)
  // Too little of the week used yet: no number.
  expect(perPercent(100, 2)).toBeNull()
  expect(perPercent(null, 10)).toBeNull()
})

test('Two looks at the same week: the earlier one counts; a new week replaces the old', () => {
  const early = { resetsAt: Date.parse(RESET), percent: 5, values: { p: 80 } }
  const late = { resetsAt: Date.parse(RESET) + 60_000, percent: 10, values: { p: 100 } }
  expect(mergeWeekBase(late, early)).toEqual(early)
  expect(mergeWeekBase(early, late)).toEqual(early)
  const next = { resetsAt: Date.parse(NEXT_RESET), percent: 1, values: { p: 300 } }
  expect(mergeWeekBase(early, next)).toEqual(next)
  expect(mergeWeekBase(undefined, '{broken')).toBeUndefined()
})

test('The Week row shows what one percent of the week is worth', { options: { billingDay: 29, currency: 'USD', planPrice: 200 } }, async ($, on) => {
  const files = world(on, { 'ledger.json': JSON.stringify({ ledger: { '2026-09-29': { other: 100 } } }) })
  const reading = (usd: number, percentUsed: number, resetsAt = RESET) =>
    $.session.measure({
      context: { window: 200_000 },
      rateLimits: [{ kind: 'seven_day', percentUsed, resetsAt }],
      cost: { usd },
      changed: ['rateLimits', 'cost'],
    })

  // First look at this week: 10% used.
  await reading(0, 10)
  expect(JSON.parse(files['week.json'] ?? '{}')).toEqual({ resetsAt: Date.parse(RESET), percent: 10, values: { '2026-09-29': 100 } })

  // 2 points later: too early for a number.
  await reading(50, 12)
  let ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ text: /^· 1% ≈/ })).toBeUndefined()
  await ui.unmount()

  // 4 points later, $100 more: one percent is worth $25.
  await reading(100, 14)
  ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ text: /^· 1% ≈ \$25\.00 value$/ })).toBeDefined()
  await ui.press({ key: 'help' })
  expect(await ui.find({ text: /one percent of your weekly limit has bought this week/ })).toBeDefined()
  await ui.unmount()

  // A fresh week starts a fresh look.
  await reading(110, 1, NEXT_RESET)
  expect(JSON.parse(files['week.json'] ?? '{}').percent).toBe(1)
  ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ text: /^· 1% ≈/ })).toBeUndefined()
  await ui.unmount()
})

test('Another session looked at the week earlier: its look counts', { options: { billingDay: 29, currency: 'EUR', planPrice: 180, language: 'de' } }, async ($, on) => {
  const earlier = { resetsAt: Date.parse(RESET), percent: 5, values: { '2026-09-29': 80 } }
  world(on, {
    'ledger.json': JSON.stringify({ ledger: { '2026-09-29': { other: 100 } } }),
    'week.json': JSON.stringify(earlier),
  })
  const reading = (usd: number, percentUsed: number) =>
    $.session.measure({
      context: { window: 200_000 },
      rateLimits: [{ kind: 'seven_day', percentUsed, resetsAt: RESET }],
      cost: { usd },
      changed: ['rateLimits', 'cost'],
    })
  await reading(0, 9)
  await reading(80, 13)
  // Since the earlier look: $20 + $80 = $100 over 8 points = $12.50 = 11,15 €.
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ text: /^· 1 % ≈ 11,15 € Wert$/ })).toBeDefined()
  expect(await ui.find({ text: /^\(neu ab Mo \d\d:\d\d\)$/ })).toBeDefined()
  await ui.unmount()
})
