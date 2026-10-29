import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const SURFACE_PROPS = {
  AbovePrompt: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 110,
    scroll: { offset: 0, bodyRows: 19 },
    view: {},
  },
  Pane: {
    title: 'Quanta Costa',
    isFocused: false,
    bodyColumns: 110,
    placement: 'inline',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

type Doc = { since?: Record<string, number>; counts?: Record<string, Record<string, Record<string, [number, number]>>> }

// October 30: a day into the period that began on October 29.
const NOW = Date.parse('2026-10-30T10:00:00Z')

const world = (on: On, doc: Doc) => {
  const files: Record<string, string> = { 'value.json': JSON.stringify(doc) }
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
}

const ended: Doc = {
  since: { '2026-09-29': Date.parse('2026-10-09T15:35:00Z'), '2026-10-29': Date.parse('2026-10-29T00:00:00Z') },
  counts: {
    '2026-09-29': { a: { 'k0-a': [0, 250] }, b: { 'k0-b': [10, 60] } },
    '2026-10-29': { a: { 'k1-a': [250, 260] } },
  },
}

test('The last period stays in the pane and the help, the band stays as it is', { options: { billingDay: 29, currency: 'USD', planPrice: 200 } }, async ($, on) => {
  world(on, ended)
  await $.session.measure({ context: { window: 200_000 }, rateLimits: [], cost: { usd: 0 }, changed: ['cost'] })

  // $250 + $50 = $300 against a $200 plan, counted since October 9.
  const line = /^Last period Sep 29 to Oct 29: \$300\.00 API value since Oct 9 \(1\.5×\)$/

  const pane = await $.ui.mount({ plugin: 'quanta-costa', surface: 'desktop', component: 'Pane', props: SURFACE_PROPS.Pane, requestId: 'quanta-costa' })
  expect(await pane.find({ text: line })).toBeDefined()
  await pane.unmount()

  const band = await $.ui.mount({ plugin: 'quanta-costa', surface: 'desktop', component: 'AbovePrompt', props: SURFACE_PROPS.AbovePrompt })
  expect(await band.find({ text: line })).toBeUndefined()
  await band.press({ key: 'help' })
  expect(await band.find({ text: /^Last period Sep 29 to Oct 29:$/ })).toBeDefined()
  expect(await band.find({ text: / \$300\.00 API value since Oct 9 \(1\.5×\)$/ })).toBeDefined()
  await band.unmount()
})

test('On the phone and with /quanta-costa the last period comes with the numbers', { options: { billingDay: 29, currency: 'EUR', planPrice: 180, language: 'de' } }, async ($, on) => {
  world(on, ended)
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  await $.session.measure({ context: { window: 200_000 }, rateLimits: [], cost: { usd: 0 }, changed: ['cost'] })
  const { text } = await $.command.run({
    command: 'quanta-costa',
    args: '',
    origin: { kind: 'bridge' },
    presentation: { isFullscreen: false, columns: 44 },
  })
  // $300 = 267,71 € against 180 €: 1,5 times.
  expect(text).toMatch(/ \| Letzte Periode 29\.09\. bis 29\.10\.: 267,71 € API-Wert seit 09\.10\. \(1,5×\)$/)
})

test('A full period counted from its first day says no "since"', { options: { billingDay: 29, currency: 'USD', planPrice: 200 } }, async ($, on) => {
  world(on, { ...ended, since: { '2026-09-29': Date.parse('2026-09-29T00:00:00Z') } })
  await $.session.measure({ context: { window: 200_000 }, rateLimits: [], cost: { usd: 0 }, changed: ['cost'] })
  const pane = await $.ui.mount({ plugin: 'quanta-costa', surface: 'desktop', component: 'Pane', props: SURFACE_PROPS.Pane, requestId: 'quanta-costa' })
  expect(await pane.find({ text: /^Last period Sep 29 to Oct 29: \$300\.00 API value \(1\.5×\)$/ })).toBeDefined()
  await pane.unmount()
})
