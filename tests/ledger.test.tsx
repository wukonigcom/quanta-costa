import { expect, mock, test } from 'claude-code/testing'

import { addReading, mergeLedgers, mergeNotices } from '../hooks/register'

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

test('A resumed session adds each run: Claude Code counts it from zero again', () => {
  // Monday: the first reading of a new session.
  let booked = addReading(0, undefined, 30)
  expect(booked).toBe(30)
  // Tuesday: resumed, Claude Code starts at zero, then $20 of work.
  booked = addReading(booked, 30, 0)
  booked = addReading(booked, 0, 20)
  expect(booked).toBe(50)
  // Wednesday: resumed again, $40 of work.
  booked = addReading(booked, 20, 40 - 40)
  booked = addReading(booked, 0, 40)
  expect(booked).toBe(90)
  // The same reading twice adds nothing.
  expect(addReading(90, 40, 40)).toBe(90)
  // A new period gets only the work done in it.
  expect(addReading(0, 30, 45)).toBe(15)
  // Booked by an older version without a last reading: the larger amount, as before.
  expect(addReading(33, undefined, 6)).toBe(33)
})

test('Value gets every run of a resumed session', { options: { billingDay: 29, currency: 'USD', planPrice: 200 } }, async ($, on) => {
  let file = JSON.stringify({ ledger: { '2026-09-29': { other: 100 } } })
  mock.clock(on, { now: Date.parse('2026-10-09T12:00:00Z') })
  mock.env(on, { USERPROFILE: 'C:/Users/test' })
  mock.store(on)
  on('fs.read', () => ({ value: file }))
  on('fs.write', ($, e) => {
    file = e.text
    return { value: undefined }
  })
  on('session.id', () => ({ value: 'this-session' }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  const reading = (usd: number) =>
    $.session.measure({ context: { window: 200_000 }, rateLimits: [], cost: { usd }, changed: ['cost'] })

  await reading(30) // Monday
  await reading(0) // Tuesday, resumed
  await reading(20)

  const saved = JSON.parse(file) as { ledger: Record<string, Record<string, number>>; runs: Record<string, number> }
  expect(saved.ledger['2026-09-29']).toEqual({ other: 100, 'this-session': 50 })
  expect(saved.runs).toEqual({ 'this-session': 20 })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  // $100 + $50, while the Session row shows the current run's $20.
  expect(await ui.find({ text: /^\$150\.00 API value vs \$200\.00 plan$/ })).toBeDefined()
  expect(await ui.find({ text: /^0 tokens · \$20\.00$/ })).toBeDefined()
  await ui.unmount()
})

test('A broken store (left empty by an unclean shutdown) does not stop the booking', { options: { billingDay: 29, currency: 'USD', planPrice: 200 } }, async ($, on) => {
  let file = JSON.stringify({ ledger: { '2026-09-29': { other: 100 } } })
  mock.clock(on, { now: Date.parse('2026-10-09T12:00:00Z') })
  mock.env(on, { USERPROFILE: 'C:/Users/test' })
  on('store.get', () => {
    throw new Error('Unexpected token in JSON at position 0')
  })
  on('store.set', () => {
    throw new Error('store unavailable')
  })
  on('fs.read', () => ({ value: file }))
  on('fs.write', ($, e) => {
    file = e.text
    return { value: undefined }
  })
  on('session.id', () => ({ value: 'this-session' }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.measure({ context: { window: 200_000 }, rateLimits: [], cost: { usd: 30 }, changed: ['cost'] })

  const saved = JSON.parse(file) as { ledger: Record<string, Record<string, number>> }
  expect(saved.ledger['2026-09-29']).toEqual({ other: 100, 'this-session': 30 })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ text: /^\$130\.00 API value vs \$200\.00 plan$/ })).toBeDefined()
  await ui.unmount()
})

test('A crash that leaves ledger.json as zero bytes loses nothing: the backup copy fills in', { options: { billingDay: 29, currency: 'USD', planPrice: 200 } }, async ($, on) => {
  const files: Record<string, string> = {
    'ledger.json': '\u0000'.repeat(1800),
    'ledger.backup.json': JSON.stringify({ ledger: { '2026-09-29': { other: 100, 'this-session': 30 } }, runs: { 'this-session': 30 } }),
  }
  const name = (path: string) => path.replace(/^.*[\\/]/, '')
  mock.clock(on, { now: Date.parse('2026-10-09T12:00:00Z') })
  mock.env(on, { USERPROFILE: 'C:/Users/test' })
  mock.store(on)
  on('fs.read', ($, e) => ({ value: files[name(e.path)] ?? '' }))
  on('fs.write', ($, e) => {
    files[name(e.path)] = e.text
    return { value: undefined }
  })
  on('session.id', () => ({ value: 'this-session' }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.measure({ context: { window: 200_000 }, rateLimits: [], cost: { usd: 35 }, changed: ['cost'] })

  const saved = JSON.parse(files['ledger.json'] ?? '{}') as { ledger: Record<string, Record<string, number>> }
  expect(saved.ledger['2026-09-29']).toEqual({ other: 100, 'this-session': 35 })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ text: /^\$135\.00 API value vs \$200\.00 plan$/ })).toBeDefined()
  await ui.unmount()
})

test('The backup copy is written at most every ten minutes, so it is never the file just written', { options: { billingDay: 29, currency: 'USD', planPrice: 200 } }, async ($, on) => {
  const writes: string[] = []
  const clock = mock.clock(on, { now: Date.parse('2026-10-09T12:00:00Z') })
  mock.env(on, { USERPROFILE: 'C:/Users/test' })
  mock.store(on)
  on('fs.read', () => ({ value: '' }))
  on('fs.write', ($, e) => {
    writes.push(e.path.replace(/^.*[\\/]/, ''))
    return { value: undefined }
  })
  on('session.id', () => ({ value: 'this-session' }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  const reading = (usd: number) =>
    $.session.measure({ context: { window: 200_000 }, rateLimits: [], cost: { usd }, changed: ['cost'] })

  await reading(1)
  await reading(2)
  await clock.advance(11 * 60_000)
  await reading(3)
  expect(writes.filter(w => w === 'ledger.backup.json')).toHaveLength(2)
  expect(writes.filter(w => w === 'ledger.json').length).toBeGreaterThanOrEqual(3)
})
