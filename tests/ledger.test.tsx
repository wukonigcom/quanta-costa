import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { mergeCounts, mergeLedgers, mergeNotices, nextEntry, periodValue, readingBefore } from '../hooks/register'

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

type Doc = { since?: Record<string, number>; counts?: Record<string, Record<string, Record<string, [number, number]>>> }

// The files in ~/.claude/quanta-costa, by name.
const disk = (on: On, files: Record<string, string> = {}) => {
  const name = (path: string) => path.replace(/^.*[\\/]/, '')
  on('fs.read', ($, e) => ({ value: files[name(e.path)] ?? '' }))
  on('fs.write', ($, e) => {
    files[name(e.path)] = e.text
    return { value: undefined }
  })
  return files
}

const world = (on: On, files: Record<string, string> = {}, store: Record<string, unknown> = {}) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-09T12:00:00Z') })
  mock.env(on, { USERPROFILE: 'C:/Users/test' })
  mock.store(on, store)
  on('session.id', () => ({ value: 'this-session' }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  return { files: disk(on, files), clock }
}

// Counted from the period's first day.
const SEP_29 = Date.parse('2026-09-29T08:00:00Z')

const doc = (files: Record<string, string>) => JSON.parse(files['value.json'] ?? '{}') as Doc

test(
  'Value counts every session of the period, whatever name each one ran under',
  { options: { billingDay: 29, currency: 'EUR', planPrice: 5 } },
  async ($, on) => {
    // This name's own store knows a command-line session, the shared file a desktop session.
    const { files } = world(
      on,
      { 'ledger.json': JSON.stringify({ ledger: { '2026-09-29': { 'desktop-session': 20 } } }) },
      { ledger: { '2026-09-29': { 'cli-session': 3 } } },
    )
    const reading = (usd: number) =>
      $.session.measure({ context: { window: 200_000 }, rateLimits: [{ kind: 'seven_day', percentUsed: 42, resetsAt: '2026-10-12T12:00:00Z' }], cost: { usd }, changed: ['rateLimits', 'cost'] })
    await reading(0)
    await reading(10)

    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    // $3 + $20 + $10 = $33 = €29.45 against a €5 plan: 5.9 times.
    expect(await ui.find({ text: /^€29\.45 API value vs €5\.00 plan$/ })).toBeDefined()
    expect(await ui.find({ text: /^\(5\.9×\)$/ })).toBeDefined()
    await ui.unmount()

    const runs = doc(files).counts?.['2026-09-29']?.['this-session'] ?? {}
    expect(Object.values(runs)).toEqual([[0, 10]])
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

test('Merging runs keeps the higher reading per run, so an old copy changes nothing', () => {
  const now = { p: { s: { r1: [0, 30] as [number, number], r2: [30, 45] as [number, number] } } }
  const stale = { p: { s: { r1: [0, 20] as [number, number] } } }
  expect(mergeCounts(stale, now)).toEqual(now)
  expect(mergeCounts(now, stale)).toEqual(now)
  expect(periodValue({ old: 5 }, now.p)).toBe(50)
  expect(periodValue({ old: 5 }, now.p, { sid: 's', run: 'r2' })).toBe(35)
})

test('Each run of a session counts only what it adds', () => {
  // A new session: the counter starts at zero.
  let run = nextEntry(undefined, undefined, undefined, 0)
  run = nextEntry(run, undefined, undefined, 30)
  expect(run).toEqual([0, 30])
  // Resumed, and Claude Code carries the $30 over: only the $20 of new work count.
  let resumed = nextEntry(undefined, undefined, 30, 30)
  resumed = nextEntry(resumed, undefined, 30, 50)
  expect(resumed[1] - resumed[0]).toBe(20)
  // Resumed with a counter from zero: the same $20.
  let fresh = nextEntry(undefined, undefined, 30, 0)
  fresh = nextEntry(fresh, undefined, 30, 20)
  expect(fresh[1] - fresh[0]).toBe(20)
  // A counter that starts at zero and gets the $30 carried over a moment later: still $20.
  let late = nextEntry(undefined, undefined, 30, 0)
  late = nextEntry(late, undefined, 30, 50)
  expect(late[1] - late[0]).toBe(20)
  // A lower reading in between changes nothing.
  expect(nextEntry([30, 50], undefined, 30, 10)).toEqual([30, 50])
  // Into the next period: on from where the run left the last one.
  expect(nextEntry(undefined, [0, 40], undefined, 45)).toEqual([40, 45])
})

test('The last reading before a run: the latest other run, else what an older version booked', () => {
  const counts = { p: { s: { 'a-1': [0, 30] as [number, number], 'b-1': [30, 70] as [number, number], 'c-1': [70, 80] as [number, number] } } }
  expect(readingBefore(counts, { s: 12 }, 's', 'c-1')).toBe(70)
  expect(readingBefore({}, { s: 12 }, 's', 'c-1')).toBe(12)
  expect(readingBefore({}, undefined, 's', 'c-1')).toBeUndefined()
})

test('A resumed session counts each run once: Claude Code carries its cost over', { options: { billingDay: 29, currency: 'USD', planPrice: 200 } }, async ($, on) => {
  // Monday's run of this session counted $30.
  const earlier: Doc = { since: { '2026-09-29': SEP_29 }, counts: { '2026-09-29': { 'this-session': { 'k0-mon': [0, 30] } } } }
  const { files } = world(on, { 'value.json': JSON.stringify(earlier) })
  const reading = (usd: number) =>
    $.session.measure({ context: { window: 200_000 }, rateLimits: [], cost: { usd }, changed: ['cost'] })
  // Tuesday: resumed, the counter goes on from $30, then $20 of work.
  await reading(30)
  await reading(50)

  const runs = doc(files).counts?.['2026-09-29']?.['this-session'] ?? {}
  expect(periodValue({}, { 'this-session': runs })).toBe(50)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  // $50 in the period, while the Session row shows Claude Code's own $50.
  expect(await ui.find({ text: /^\$50\.00 API value vs \$200\.00 plan$/ })).toBeDefined()
  expect(await ui.find({ text: /^0 tokens · \$50\.00$/ })).toBeDefined()
  await ui.unmount()
})

test('A resumed session counts each run once: Claude Code starts from zero', { options: { billingDay: 29, currency: 'USD', planPrice: 200 } }, async ($, on) => {
  const earlier: Doc = { since: { '2026-09-29': SEP_29 }, counts: { '2026-09-29': { 'this-session': { 'k0-mon': [0, 30] } } } }
  world(on, { 'value.json': JSON.stringify(earlier) })
  const reading = (usd: number) =>
    $.session.measure({ context: { window: 200_000 }, rateLimits: [], cost: { usd }, changed: ['cost'] })
  await reading(0)
  await reading(20)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ text: /^\$50\.00 API value vs \$200\.00 plan$/ })).toBeDefined()
  await ui.unmount()
})

test('A session booked by a version before 1.6.1 goes on from its last reading', { options: { billingDay: 29, currency: 'USD', planPrice: 200 } }, async ($, on) => {
  const old = { ledger: { '2026-09-29': { 'this-session': 30, other: 100 } }, runs: { 'this-session': 30 } }
  const { files } = world(on, { 'ledger.json': JSON.stringify(old) })
  const reading = (usd: number) =>
    $.session.measure({ context: { window: 200_000 }, rateLimits: [], cost: { usd }, changed: ['cost'] })
  await reading(32)
  await reading(50)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  // $100 + $30 from before, plus $20 since the last reading ($2 of it unbooked before the update).
  expect(await ui.find({ text: /^\$150\.00 API value vs \$200\.00 plan$/ })).toBeDefined()
  await ui.unmount()
  // The old amounts stay as they are.
  expect(JSON.parse(files['ledger.json'] ?? '{}').ledger['2026-09-29']).toEqual({ 'this-session': 30, other: 100 })
})

test('A broken store (left empty by an unclean shutdown) does not stop the booking', { options: { billingDay: 29, currency: 'USD', planPrice: 200 } }, async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-10-09T12:00:00Z') })
  mock.env(on, { USERPROFILE: 'C:/Users/test' })
  on('store.get', () => {
    throw new Error('Unexpected token in JSON at position 0')
  })
  on('store.set', () => {
    throw new Error('store unavailable')
  })
  const files = disk(on, { 'ledger.json': JSON.stringify({ ledger: { '2026-09-29': { other: 100 } } }) })
  on('session.id', () => ({ value: 'this-session' }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.measure({ context: { window: 200_000 }, rateLimits: [], cost: { usd: 0 }, changed: ['cost'] })
  await $.session.measure({ context: { window: 200_000 }, rateLimits: [], cost: { usd: 30 }, changed: ['cost'] })

  expect(Object.values(doc(files).counts?.['2026-09-29']?.['this-session'] ?? {})).toEqual([[0, 30]])
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ text: /^\$130\.00 API value vs \$200\.00 plan$/ })).toBeDefined()
  await ui.unmount()
})

test('A crash that leaves value.json as zero bytes loses nothing: the backup copy fills in', { options: { billingDay: 29, currency: 'USD', planPrice: 200 } }, async ($, on) => {
  const backup: Doc = { since: { '2026-09-29': SEP_29 }, counts: { '2026-09-29': { other: { 'k0-a': [0, 100] } } } }
  const { files } = world(on, { 'value.json': '\u0000'.repeat(1800), 'value.backup.json': JSON.stringify(backup) })
  await $.session.measure({ context: { window: 200_000 }, rateLimits: [], cost: { usd: 0 }, changed: ['cost'] })
  await $.session.measure({ context: { window: 200_000 }, rateLimits: [], cost: { usd: 35 }, changed: ['cost'] })

  expect(doc(files).counts?.['2026-09-29']?.other).toEqual({ 'k0-a': [0, 100] })
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
  expect(writes.filter(w => w === 'value.backup.json')).toHaveLength(2)
  expect(writes.filter(w => w === 'value.json').length).toBeGreaterThanOrEqual(3)
})

test('The Value row says since when it counts, when that was after the period began', { options: { billingDay: 29, currency: 'EUR', planPrice: 180, language: 'de' } }, async ($, on) => {
  const { files } = world(on)
  await $.session.measure({ context: { window: 200_000 }, rateLimits: [], cost: { usd: 0 }, changed: ['cost'] })
  await $.session.measure({ context: { window: 200_000 }, rateLimits: [], cost: { usd: 100 }, changed: ['cost'] })
  expect(doc(files).since).toEqual({ '2026-09-29': Date.parse('2026-10-09T12:00:00Z') })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ text: /^89,24 € API-Wert seit 09\.10\. vs\. 180,00 € Abo$/ })).toBeDefined()
  await ui.unmount()
})

test('No "since" for a period that holds amounts from before 1.6.1, or that was counted from its first day', { options: { billingDay: 29, currency: 'USD', planPrice: 200 } }, async ($, on) => {
  const { files, clock } = world(on, { 'ledger.json': JSON.stringify({ ledger: { '2026-09-29': { other: 100 } } }) })
  const reading = (usd: number) =>
    $.session.measure({ context: { window: 200_000 }, rateLimits: [], cost: { usd }, changed: ['cost'] })
  await reading(0)
  expect(doc(files).since ?? {}).toEqual({})
  let ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ text: /^\$100\.00 API value vs \$200\.00 plan$/ })).toBeDefined()
  await ui.unmount()

  // Two days into the next period, the run goes on: counted from its first day, no "since".
  await clock.advance(22 * 86_400_000)
  await reading(10)
  expect(doc(files).since?.['2026-10-29']).toBe(Date.parse('2026-10-29T00:00:00Z'))
  ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ text: /^\$10\.00 API value vs \$200\.00 plan$/ })).toBeDefined()
  await ui.unmount()
})

test('A run across the billing day splits its cost between the periods', { options: { billingDay: 29, currency: 'USD', planPrice: 200 } }, async ($, on) => {
  const { files, clock } = world(on)
  const reading = (usd: number) =>
    $.session.measure({ context: { window: 200_000 }, rateLimits: [], cost: { usd }, changed: ['cost'] })
  await reading(0)
  await clock.advance(19 * 86_400_000) // Oct 28
  await reading(10)
  await clock.advance(86_400_000) // Oct 29
  await reading(15)
  const counts = doc(files).counts ?? {}
  expect(periodValue({}, counts['2026-09-29'])).toBe(10)
  expect(periodValue({}, counts['2026-10-29'])).toBe(5)
})
