import { expect, mock, test } from 'claude-code/testing'

import { mergeLedgers, mergeNotices } from '../hooks/register'

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

test(
  'Value counts every session of the period, whatever name each one ran under',
  { options: { billingDay: 29, currency: 'EUR', planPrice: 5 } },
  async ($, on) => {
    const writes: string[] = []
    mock.clock(on, { now: Date.parse('2026-10-09T12:00:00Z') })
    mock.env(on, { USERPROFILE: 'C:/Users/test' })
    // This name's own store knows a command-line session ...
    mock.store(on, { ledger: { '2026-09-29': { 'cli-session': 3 } } })
    // ... the shared file knows a desktop session.
    on('fs.read', () => ({ value: JSON.stringify({ ledger: { '2026-09-29': { 'desktop-session': 20 } } }) }))
    on('fs.write', ($, e) => {
      writes.push(e.text)
      return { value: undefined }
    })
    on('session.id', () => ({ value: 'this-session' }))
    on('session.measure', ($, e) => ({ changed: e.changed }))
    await $.session.measure({
      context: { window: 200_000 },
      rateLimits: [{ kind: 'seven_day', percentUsed: 42, resetsAt: '2026-10-12T12:00:00Z' }],
      cost: { usd: 10 },
      changed: ['rateLimits', 'cost'],
    })

    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    // $3 + $20 + $10 = $33 = €29.45 against a €5 plan: 5.9 times.
    expect(await ui.find({ text: /^€29\.45 API value vs €5\.00 plan$/ })).toBeDefined()
    expect(await ui.find({ text: /^\(5\.9×\)$/ })).toBeDefined()
    await ui.unmount()

    const saved = JSON.parse(writes.find(w => w.includes('ledger')) ?? '{}') as { ledger?: Record<string, Record<string, number>> }
    expect(saved.ledger?.['2026-09-29']).toEqual({ 'desktop-session': 20, 'cli-session': 3, 'this-session': 10 })
  },
)

test('Merging ledgers keeps the larger amount per session', () => {
  const merged = mergeLedgers({ p: { a: 5, b: 1 } }, { p: { a: 3, c: 2 }, q: { d: 1 } })
  expect(merged).toEqual({ p: { a: 5, b: 1, c: 2 }, q: { d: 1 } })
})

test('Merging notices keeps the later week and, within one week, the higher level', () => {
  const day = 86_400_000
  expect(mergeNotices({ week: 10 * day, level: 80 }, { week: 10 * day + 1000, level: 90 })).toEqual({
    week: 10 * day + 1000,
    level: 90,
  })
  expect(mergeNotices({ week: 10 * day, level: 90 }, { week: 17 * day, level: 0 })).toEqual({ week: 17 * day, level: 0 })
  expect(mergeNotices({ seenPeriod: '2026-08-29' }, { seenPeriod: '2026-09-29' }).seenPeriod).toBe('2026-09-29')
})
