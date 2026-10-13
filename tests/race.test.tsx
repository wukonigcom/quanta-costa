import { expect, mock, test } from 'claude-code/testing'

import { periodValue } from '../hooks/register'

type Doc = { counts?: Record<string, Record<string, Record<string, [number, number]>>> }

// Many sessions write the same file. One of them can write back what it read a moment earlier
// (both read, both write, the later write wins), or read the file half written. Neither may
// count a cost twice: up to 1.6.0 it did, and the Value row showed up to 2.5 times the real cost.
test('A stale value.json written back by another session never counts a cost twice', { options: { billingDay: 29, currency: 'USD', planPrice: 200 } }, async ($, on) => {
  const files: Record<string, string> = {
    'ledger.json': JSON.stringify({ ledger: { '2026-09-29': { other: 100 } } }),
  }
  const name = (path: string) => path.replace(/^.*[\\/]/, '')
  mock.clock(on, { now: Date.parse('2026-10-09T12:00:00Z') })
  mock.env(on, { USERPROFILE: 'C:/Users/test' })
  mock.store(on)
  on('fs.read', ($, e) => ({ value: files[name(e.path)] ?? '' }))
  on('fs.write', ($, e) => {
    if (!name(e.path).includes('backup')) files[name(e.path)] = e.text
    return { value: undefined }
  })
  on('session.id', () => ({ value: 'this-session' }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  const reading = (usd: number) =>
    $.session.measure({ context: { window: 200_000 }, rateLimits: [], cost: { usd }, changed: ['cost'] })

  await reading(0)
  await reading(10)
  const staleView = files['value.json'] ?? '' // what another session read now
  await reading(20)
  files['value.json'] = staleView // ... and wrote back after this session's booking
  await reading(30)
  files['value.json'] = '{"counts": {"2026-09' // a file read half written
  await reading(40)

  const saved = JSON.parse(files['value.json'] ?? '{}') as Doc
  // Claude Code's counter says $40 for this session.
  expect(periodValue({}, saved.counts?.['2026-09-29'])).toBe(40)
  const ui = await $.ui.mount({
    plugin: 'quanta-costa',
    surface: 'desktop',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 110, scroll: { offset: 0, bodyRows: 19 }, view: {} },
  })
  expect(await ui.find({ text: /^\$140\.00 API value vs \$200\.00 plan$/ })).toBeDefined()
  await ui.unmount()
})

test('Two bookings at the very start make one run, not two', { options: { billingDay: 29, currency: 'USD', planPrice: 200 } }, async ($, on) => {
  const files: Record<string, string> = {}
  mock.clock(on, { now: Date.parse('2026-10-09T12:00:00Z') })
  mock.env(on, { USERPROFILE: 'C:/Users/test' })
  mock.store(on)
  const name = (path: string) => path.replace(/^.*[\\/]/, '')
  on('fs.read', ($, e) => ({ value: files[name(e.path)] ?? '' }))
  on('fs.write', ($, e) => {
    files[name(e.path)] = e.text
    return { value: undefined }
  })
  on('session.id', () => ({ value: 'this-session' }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  const reading = (usd: number) =>
    $.session.measure({ context: { window: 200_000 }, rateLimits: [], cost: { usd }, changed: ['cost'] })

  await Promise.all([reading(0), reading(0)])
  await reading(10)
  const runs = (JSON.parse(files['value.json'] ?? '{}') as Doc).counts?.['2026-09-29']?.['this-session'] ?? {}
  expect(Object.keys(runs)).toHaveLength(1)
  expect(periodValue({}, { 'this-session': runs })).toBe(10)
})
