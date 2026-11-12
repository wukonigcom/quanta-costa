import { expect, mock, test } from 'claude-code/testing'
import type { ConfigRow, On } from 'claude-code'

import { parseAmount, parseDay, priceChoices, stepsFor, unsynced, withSetup } from '../hooks/register'

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

const row = (field: string, value: string | number): ConfigRow => ({
  key: `quanta-costa.${field}`,
  label: field,
  kind: typeof value === 'number' ? 'number' : 'choice',
  value,
  provider: { plugin: 'quanta-costa', tier: 'user' },
  isLocked: false,
})

// A first start: no settings, no setup.json. Claude Code's settings rows take what is set.
const world = (on: On, files: Record<string, string> = {}, refuse: string[] = []) => {
  const name = (path: string) => path.replace(/^.*[\\/]/, '')
  const sets: [string, unknown][] = []
  mock.clock(on, { now: NOW })
  mock.env(on, { USERPROFILE: 'C:/Users/test' })
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 'this-session' }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200_000 }, rateLimits: LIMITS, cost: { usd: 10 } },
  }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.toast', () => ({ value: undefined }))
  on('fs.read', ($, e) => ({ value: files[name(e.path)] ?? '' }))
  on('fs.write', ($, e) => {
    files[name(e.path)] = e.text
    return { value: undefined }
  })
  on('config.list', () => ({
    value: [row('language', 'en'), row('billingDay', 0), row('currency', 'USD'), row('planPrice', 0)],
  }))
  on('config.set', ($, e) => {
    sets.push([e.key, e.value])
    return refuse.includes(e.key) ? { deny: 'refused in this test' } : { value: e.value }
  })
  return { files, sets }
}

const start = async ($: Parameters<Parameters<typeof test>[1]>[0]) => {
  await $.session.start({ cwd: 'C:/work', surface: 'desktop', isInteractive: true })
  await $.session.measure({ context: { window: 200_000 }, rateLimits: LIMITS, cost: { usd: 10 }, changed: ['rateLimits', 'cost'] })
}

test('Steps, prices and typed amounts', () => {
  expect(stepsFor('ultra')).toEqual(['language', 'plan', 'currency', 'price', 'day', 'review'])
  expect(stepsFor('api')).toEqual(['language', 'plan', 'currency', 'review'])
  expect(priceChoices('ultra', 'USD', 0.89238)).toEqual([{ amount: 200, usd: 200, kind: 'list' }])
  expect(priceChoices('pro', 'USD', 0.89238).map(c => c.amount)).toEqual([20, 17])
  // $200 at 0.89238 is €178.48, offered rounded as about €178.
  expect(priceChoices('ultra', 'EUR', 0.89238)).toEqual([{ amount: 178, usd: 200, kind: 'converted' }])
  expect(priceChoices('team', 'USD', 0.89238)).toEqual([])
  expect(['180', '17.50', '17,50', '€ 180', '0', 'abc', ''].map(parseAmount)).toEqual([180, 17.5, 17.5, 180, null, null, null])
  expect(['29', '29.', ' 1 ', '0', '32', '2.5'].map(parseDay)).toEqual([29, 29, 1, null, null, null])
})

test('Picks win until Claude Code holds the same value, then they are dropped', () => {
  const given = { language: 'en', currency: 'USD', planPrice: 0, billingDay: 0 }
  const doc = { done: true, plan: 'ultra' as const, planPrice: 180, billingDay: 29, currency: 'EUR', language: 'en' }
  expect(withSetup(given, doc)).toMatchObject({ planPrice: 180, billingDay: 29, currency: 'EUR' })
  expect(unsynced(doc, { ...given, planPrice: 180, billingDay: 29 })).toEqual({ done: true, plan: 'ultra', currency: 'EUR' })
})

test('First start: the band walks through the setup and the numbers follow the picks', async ($, on) => {
  const { files, sets } = world(on)
  await start($)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ text: /^Set up Quanta Costa · step 1 of 6$/ })).toBeDefined()
    expect(await ui.find({ key: 'week' })).toBeUndefined()
    const hint = await ui.find({ text: /ctrl\+x, then tab/ })
    expect(hint !== undefined).toBe(surface === 'terminal')
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'lang-en' })
  expect(await ui.find({ text: /^Which Claude plan do you have\?$/ })).toBeDefined()
  expect(await ui.find({ key: 'plan-ultra' })).toBeDefined()
  await ui.press({ key: 'plan-ultra' })
  await ui.press({ key: 'cur-EUR' })

  expect(await ui.find({ text: /^Set up Quanta Costa · step 4 of 6$/ })).toBeDefined()
  expect((await ui.find({ key: 'price-0' }))?.text).toMatch(/about €178\.00 \(list price \$200\.00 converted\)/)
  await ui.input({ key: 'price', text: 'abc' })
  expect(await ui.find({ text: /^Please type an amount above 0/ })).toBeDefined()
  await ui.input({ key: 'price', text: '180' })

  await ui.input({ key: 'day', text: '40' })
  expect(await ui.find({ text: /^Please type a day from 1 to 31\.$/ })).toBeDefined()
  await ui.input({ key: 'day', text: '29' })

  expect(await ui.find({ text: /^Ultra \(was Max 20x\) · €180\.00 a month · renews on day 29 · English$/ })).toBeDefined()
  await ui.press({ key: 'save' })

  // The band shows the numbers again, with the picks: a Period row and the Value row in euros.
  const rows = (await ui.findAll({ type: 'Box' })).filter(r => r.key !== undefined).map(r => r.key)
  expect(rows).toEqual(['logo', 'period', 'week', 'session', 'value'])
  expect(await ui.find({ text: /vs €180\.00 plan$/ })).toBeDefined()
  await ui.unmount()

  // Claude Code's own settings got every pick, so setup.json only remembers that it is done.
  expect(sets).toEqual([
    ['quanta-costa.planPrice', 180],
    ['quanta-costa.billingDay', 29],
    ['quanta-costa.currency', 'EUR'],
  ])
  expect(JSON.parse(files['setup.json'] ?? '{}')).toEqual({ done: true, plan: 'ultra' })
})

test('A refused write keeps the pick in setup.json, and the next start uses it', async ($, on) => {
  const { files } = world(on, {}, ['quanta-costa.planPrice'])
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  for (const key of ['lang-de', 'plan-max', 'cur-USD', 'price-0']) await ui.press({ key })
  await ui.press({ key: 'skip-day' })
  expect(await ui.find({ text: /^Max \(früher Max 5x\) · 100,00 \$ im Monat · Abrechnungstag offen · Deutsch$/ })).toBeDefined()
  await ui.press({ key: 'save' })
  await ui.unmount()
  expect(JSON.parse(files['setup.json'] ?? '{}')).toEqual({ done: true, plan: 'max', planPrice: 100 })

  // A reload hands over the options Claude Code still has (no plan price): the pick fills it in.
  await $.session.start({ cwd: 'C:/work', surface: 'desktop', isInteractive: true })
  const later = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await later.find({ text: /vs\. 100,00 \$ Abo$/ })).toBeDefined()
  await later.unmount()
})

test('API key: no price and no billing day, the costs are real', async ($, on) => {
  const { files, sets } = world(on)
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  for (const key of ['lang-en', 'plan-api', 'cur-USD']) await ui.press({ key })
  expect(await ui.find({ text: /^Set up Quanta Costa · step 4 of 4$/ })).toBeDefined()
  expect(await ui.find({ text: /^API key, no plan · costs are real, no plan value · US dollars · English$/ })).toBeDefined()
  await ui.press({ key: 'save' })
  expect(await ui.find({ key: 'value' })).toBeUndefined()
  await ui.unmount()
  expect(sets).toEqual([])
  expect(JSON.parse(files['setup.json'] ?? '{}')).toEqual({ done: true, plan: 'api' })
})

test('Not now hides it for this session; Don\'t ask again for good; Back goes one step back', async ($, on) => {
  const { files } = world(on)
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'lang-en' })
  await ui.press({ key: 'back' })
  expect(await ui.find({ text: /step 1 of 6$/ })).toBeDefined()
  await ui.press({ key: 'later' })
  expect(await ui.find({ key: 'week' })).toBeDefined()
  expect(files['setup.json']).toBeUndefined()
  await ui.unmount()

  // A reload in the same session does not ask again.
  await $.session.start({ cwd: 'C:/work', surface: 'desktop', isInteractive: true })
  const again = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await again.find({ key: 'week' })).toBeDefined()
  await again.press({ key: 'help' })
  await again.press({ key: 'setup' })
  await again.press({ key: 'never' })
  await again.unmount()
  expect(JSON.parse(files['setup.json'] ?? '{}')).toEqual({ done: true })
})

test('Already set up: no questions at start, the help opens the steps with the settings filled in', { options: { billingDay: 29, currency: 'EUR', planPrice: 180 } }, async ($, on) => {
  world(on)
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ key: 'week' })).toBeDefined()
  await ui.press({ key: 'help' })
  expect((await ui.find({ key: 'setup' }))?.text).toBe('Change plan and price')
  await ui.press({ key: 'setup' })
  for (const key of ['lang-en', 'plan-ultra', 'cur-EUR']) await ui.press({ key })
  expect((await ui.find({ key: 'price' }))?.props).toMatchObject({ value: '180' })
  await ui.unmount()
})

test('/quanta-costa setup opens the steps in the band', { options: { billingDay: 29, currency: 'EUR', planPrice: 180 } }, async ($, on) => {
  world(on)
  await start($)
  const { text } = await $.command.run({
    command: 'quanta-costa',
    args: 'setup',
    origin: { kind: 'bridge' },
    presentation: { isFullscreen: false, columns: 80 },
  })
  expect(text).toBe('Quanta Costa: the setup steps are in the band above the prompt.')
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ text: /^Set up Quanta Costa · step 1 of 6$/ })).toBeDefined()
  await ui.unmount()
})

test('The phone never gets the setup steps, only the numbers', async ($, on) => {
  world(on)
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'mobile' })
  expect(await ui.find({ text: /Set up Quanta Costa/ })).toBeUndefined()
  expect(await ui.find({ key: 'week' })).toBeDefined()
  await ui.unmount()
})
