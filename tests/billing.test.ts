import { expect, test } from 'claude-code/testing'

import { billingPeriod } from '../hooks/register'

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const TZ = 'Europe/Vienna'

test('Billing period around the 29th', () => {
  const p = billingPeriod(Date.parse('2026-10-09T12:00:00Z'), 29, TZ)
  expect([ymd(p.start), ymd(p.end), p.daysLeft]).toEqual(['2026-09-29', '2026-10-29', 20])
  expect([p.daysGone, p.daysTotal]).toEqual([10, 30])

  const renewalDay = billingPeriod(Date.parse('2026-10-29T08:00:00Z'), 29, TZ)
  expect([ymd(renewalDay.start), ymd(renewalDay.end)]).toEqual(['2026-10-29', '2026-11-29'])

  const yearEnd = billingPeriod(Date.parse('2026-12-30T12:00:00Z'), 29, TZ)
  expect([ymd(yearEnd.start), ymd(yearEnd.end)]).toEqual(['2026-12-29', '2027-01-29'])
})

test('Day 31 falls on the last day of short months', () => {
  const p = billingPeriod(Date.parse('2026-02-10T12:00:00Z'), 31, TZ)
  expect([ymd(p.start), ymd(p.end), p.daysLeft]).toEqual(['2026-01-31', '2026-02-28', 18])
})

test('The local date counts, not UTC', () => {
  // Oct 28, 23:30 UTC is already Oct 29 in Vienna, still Oct 28 in New York.
  expect(ymd(billingPeriod(Date.parse('2026-10-28T23:30:00Z'), 29, TZ).start)).toBe('2026-10-29')
  expect(ymd(billingPeriod(Date.parse('2026-10-28T23:30:00Z'), 29, 'America/New_York').start)).toBe(
    '2026-09-29',
  )
})
