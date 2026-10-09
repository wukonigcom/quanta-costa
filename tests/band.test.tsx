import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

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

// Oct 9, 2026, 12:00 UTC
const NOW = Date.parse('2026-10-09T12:00:00Z')

const world = (on: On) => {
  mock.clock(on, { now: NOW })
  on('session.measure', ($, e) => ({ changed: e.changed }))
}

const LIMITS = [
  { kind: 'seven_day', percentUsed: 42, resetsAt: '2026-10-12T12:00:00Z' },
  { kind: 'five_hour', percentUsed: 85, resetsAt: '2026-10-09T18:00:00Z' },
]

test(
  'Bars, session cost in euros and help on terminal and desktop',
  { options: { billingDay: 29, currency: 'EUR' } },
  async ($, on) => {
    world(on)
    await $.session.measure({
      context: { window: 200_000 },
      rateLimits: LIMITS,
      cost: { usd: 10 },
      changed: ['rateLimits', 'cost'],
    })

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...BAND, surface })

      const rows = (await ui.findAll({ type: 'Box' })).filter(r => r.key !== undefined)
      expect(rows.map(r => r.key)).toEqual(['logo', 'period', 'week', 'session'])
      expect((await ui.find({ key: 'logo' }))?.text).toBe('🧾')

      expect(
        await ui.find({ text: /1\.4 of 4\.3 weeks gone · 2\.9 wk left · renews in 20 days/ }),
      ).toBeDefined()
      expect(await ui.find({ text: /^42% used · 58% free$/ })).toBeDefined()
      expect(await ui.find({ text: /^· on track$/ })).toBeDefined()
      expect(await ui.find({ text: /^\(resets Oct 12\)$/ })).toBeDefined()
      expect(await ui.find({ text: /€8\.92/ })).toBeDefined()
      expect(await ui.find({ text: /5-hour limit 85% used · resets in 6h 0m/ })).toBeDefined()
      expect(await ui.find({ text: /hypothetical/ })).toBeUndefined()

      await ui.press({ key: 'help' })
      expect(await ui.find({ text: /Costs are hypothetical/ })).toBeDefined()
      expect(await ui.find({ text: /this period runs Sep 29 to Oct 29/ })).toBeDefined()

      await ui.press({ key: 'help' })
      expect(await ui.find({ text: /hypothetical/ })).toBeUndefined()

      await ui.unmount()
    }
  },
)

test('Defaults: dollars, no Period row, help says how to set it', async ($, on) => {
  world(on)
  await $.session.measure({
    context: { window: 200_000 },
    rateLimits: LIMITS,
    cost: { usd: 10 },
    changed: ['rateLimits', 'cost'],
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ key: 'period' })).toBeUndefined()
  expect(await ui.find({ text: /\$10\.00/ })).toBeDefined()
  await ui.press({ key: 'help' })
  expect(await ui.find({ text: /set your billing day/ })).toBeDefined()
  expect(await ui.find({ text: /Euro: converted/ })).toBeUndefined()
  await ui.unmount()
})

test('No subscription limits: help says the costs are real', async ($, on) => {
  world(on)
  await $.session.measure({
    context: { window: 200_000 },
    rateLimits: [],
    cost: { usd: 2 },
    changed: ['cost'],
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ text: /no reading yet/ })).toBeDefined()
  await ui.press({ key: 'help' })
  expect(await ui.find({ text: /costs are real/ })).toBeDefined()
  await ui.unmount()
})

test('Pace: a fast week says when it runs out', async ($, on) => {
  world(on)
  await $.session.measure({
    context: { window: 200_000 },
    rateLimits: [{ kind: 'seven_day', percentUsed: 85, resetsAt: '2026-10-12T12:00:00Z' }],
    cost: { usd: 1 },
    changed: ['rateLimits', 'cost'],
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  // 85% in 4 of 7 days: empty after about 4.7 days, on Saturday.
  expect(await ui.find({ text: /^· runs out Sat \d\d:\d\d$/ })).toBeDefined()
  await ui.unmount()
})

test(
  'Value: this period against the plan price, other sessions included',
  { options: { billingDay: 29, currency: 'EUR', planPrice: 5 } },
  async ($, on) => {
    world(on)
    mock.store(on, { ledger: { '2026-09-29': { 'earlier-session': 3 } } })
    on('session.id', () => ({ value: 'this-session' }))
    await $.session.measure({
      context: { window: 200_000 },
      rateLimits: LIMITS,
      cost: { usd: 10 },
      changed: ['rateLimits', 'cost'],
    })

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...BAND, surface })
      // $13 of API value = €11.60; €5 plan: 2.3 times paid off.
      expect(await ui.find({ text: /^€11\.60 API value vs €5\.00 plan$/ })).toBeDefined()
      expect(await ui.find({ text: /^\(2\.3×\)$/ })).toBeDefined()
      await ui.unmount()
    }

    // Booking the same session again replaces its amount, it does not add up.
    await $.session.measure({
      context: { window: 200_000 },
      rateLimits: LIMITS,
      cost: { usd: 10 },
      changed: ['cost'],
    })
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ text: /^\(2\.3×\)$/ })).toBeDefined()
    await ui.unmount()
  },
)
