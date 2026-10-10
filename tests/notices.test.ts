import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// Oct 9, 2026, 12:00 UTC
const NOW = Date.parse('2026-10-09T12:00:00Z')
const RESET = '2026-10-12T12:00:00Z'

const world = (on: On, store: Record<string, unknown> = {}) => {
  const toasts: string[] = []
  mock.clock(on, { now: NOW })
  mock.store(on, store)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('session.id', () => ({ value: 'this-session' }))
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  return toasts
}

const week = (percentUsed: number, resetsAt = RESET) => [{ kind: 'seven_day', percentUsed, resetsAt }]

test('Warns once at 80% and once more at 90% of the week', async ($, on) => {
  const toasts = world(on)
  const measure = (p: number) =>
    $.session.measure({ context: { window: 200_000 }, rateLimits: week(p), cost: { usd: 1 }, changed: ['rateLimits'] })

  await measure(50)
  expect(toasts).toEqual([])
  await measure(82)
  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toMatch(/^Quanta Costa: 82% of your weekly limit used, it resets Oct 12\./)
  await measure(85)
  expect(toasts).toHaveLength(1)
  await measure(91)
  expect(toasts).toHaveLength(2)
  expect(toasts[1]).toMatch(/91% of your weekly limit used/)
})

test('Says so when a fresh week starts', async ($, on) => {
  const lastWeek = Date.parse('2026-10-05T12:00:00Z')
  const toasts = world(on, { notices: { week: lastWeek, level: 90 } })
  await $.session.measure({ context: { window: 200_000 }, rateLimits: week(3), cost: { usd: 1 }, changed: ['rateLimits'] })
  expect(toasts).toEqual(['Quanta Costa: fresh week, your weekly limit has reset (97% free).'])
})

test(
  'Looks back once at the period that just ended',
  { options: { billingDay: 29, currency: 'EUR', planPrice: 5 } },
  async ($, on) => {
    const toasts = world(on, {
      notices: { seenPeriod: '2026-08-29' },
      ledger: { '2026-08-29': { a: 8, b: 5 } },
    })
    const measure = () =>
      $.session.measure({ context: { window: 200_000 }, rateLimits: week(10), cost: { usd: 1 }, changed: ['cost'] })
    await measure()
    // $13 = €11.60 against a €5 plan: 2.3 times.
    expect(toasts).toEqual(['Quanta Costa: last period Aug 29 to Sep 29: €11.60 API value, 2.3× your plan.'])
    await measure()
    expect(toasts).toHaveLength(1)
  },
)

test('German notices', { options: { language: 'de' } }, async ($, on) => {
  const toasts = world(on)
  await $.session.measure({ context: { window: 200_000 }, rateLimits: week(82), cost: { usd: 1 }, changed: ['rateLimits'] })
  expect(toasts[0]).toMatch(/^Quanta Costa: 82 % deines Wochenlimits verbraucht, neu ab 12\.10\./)
})
