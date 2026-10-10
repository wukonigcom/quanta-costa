import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { isAllDefault, toSettings } from '../hooks/register'

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
const LIMITS = [{ kind: 'seven_day', percentUsed: 42, resetsAt: '2026-10-12T12:00:00Z' }]

const world = (on: On, settingsFile: unknown) => {
  const reads: string[] = []
  mock.clock(on, { now: NOW })
  mock.env(on, { USERPROFILE: 'C:/Users/test' })
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 'this-session' }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200_000 }, rateLimits: LIMITS, cost: { usd: 10 } },
  }))
  on('fs.read', ($, e) => {
    reads.push(e.path)
    return { value: JSON.stringify(settingsFile) }
  })
  return reads
}

test('Settings stored under another name (desktop app, local install) still arrive', async ($, on) => {
  const reads = world(on, {
    pluginConfigs: {
      'other-plugin': { options: { planPrice: 999 } },
      'quanta-costa@inline': { options: { billingDay: 29, currency: 'EUR', planPrice: 5 } },
    },
  })
  await $.session.start({ cwd: 'C:/work', surface: 'terminal', isInteractive: true })
  expect(reads).toHaveLength(1)
  expect(reads[0]).toMatch(/^C:[\\/]Users[\\/]test[\\/]\.claude[\\/]settings\.json$/)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const rows = (await ui.findAll({ type: 'Box' })).filter(r => r.key !== undefined)
  expect(rows.map(r => r.key)).toEqual(['logo', 'period', 'week', 'session', 'value'])
  expect(await ui.find({ text: /€8\.92/ })).toBeDefined()
  await ui.unmount()
})

test('Settings handed over by Claude Code win, the file is not read', { options: { currency: 'EUR' } }, async ($, on) => {
  const reads = world(on, { pluginConfigs: { 'quanta-costa': { options: { currency: 'USD', planPrice: 5 } } } })
  await $.session.start({ cwd: 'C:/work', surface: 'terminal', isInteractive: true })
  expect(reads).toEqual([])
})

test('Options as text or numbers, anything else falls back to defaults', () => {
  const c = toSettings({ billingDay: '29', planPrice: '180', currency: 'EUR', language: 'de', eurRate: 'x' })
  expect([c.billingDay, c.planPrice, c.currency, c.lang, c.eurRate]).toEqual([29, 180, 'EUR', 'de', 0.89238])
  expect(isAllDefault(toSettings({}))).toBe(true)
  expect(isAllDefault(c)).toBe(false)
})
