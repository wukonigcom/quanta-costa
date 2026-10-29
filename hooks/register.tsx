import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type { Limit, Snapshot } from '../types'

const EMPTY: Snapshot = {
  limits: [],
  usd: null,
  baseUsd: 0,
  tokens: 0,
  baseTokens: 0,
  othersUsd: 0,
  ownFirst: null,
  ownTop: 0,
  since: null,
  weekUsd: null,
  weekPoints: 0,
  prevPeriod: null,
  prevUsd: null,
  prevSince: null,
  now: 0,
}
const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

// The stored snapshot may come from an older version (state survives a reload or an update
// mid-session) and lack fields. Fill every one, so no sum turns into NaN.
export const normalize = (s: Partial<Snapshot> | null | undefined): Snapshot => ({
  limits: Array.isArray(s?.limits) ? s.limits : [],
  usd: typeof s?.usd === 'number' && Number.isFinite(s.usd) ? s.usd : null,
  baseUsd: num(s?.baseUsd),
  tokens: num(s?.tokens),
  baseTokens: num(s?.baseTokens),
  othersUsd: num(s?.othersUsd),
  ownFirst: typeof s?.ownFirst === 'number' && Number.isFinite(s.ownFirst) ? s.ownFirst : null,
  ownTop: num(s?.ownTop),
  since: typeof s?.since === 'number' && Number.isFinite(s.since) ? s.since : null,
  weekUsd: typeof s?.weekUsd === 'number' && Number.isFinite(s.weekUsd) ? s.weekUsd : null,
  weekPoints: num(s?.weekPoints),
  prevPeriod: typeof s?.prevPeriod === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.prevPeriod) ? s.prevPeriod : null,
  prevUsd: typeof s?.prevUsd === 'number' && Number.isFinite(s.prevUsd) ? s.prevUsd : null,
  prevSince: typeof s?.prevSince === 'number' && Number.isFinite(s.prevSince) ? s.prevSince : null,
  now: num(s?.now),
})

const snap = atom({ plugin: 'quanta-costa', key: 'snap' } as const, EMPTY)
const isHelpOpen = atom({ plugin: 'quanta-costa', key: 'isHelpOpen' } as const, false)

const BAR = 12
const LOGO = '🧾' // "Il conto, per favore!"
const DAY = 86_400_000
export const VERSION = '1.7.1'
const PLUGIN = 'quanta-costa'
// The same view in a pane, opened with /quanta-costa: panes show on every surface, the iPhone app included.
export const PANE = 'quanta-costa'
// "/quanta-costa" on its own, as a prompt that was not run as a command.
export const isPaneRequest = (text: string) => /^\s*\/quanta-costa\s*$/i.test(text)
// What Claude reads beside such a prompt, so that its reply carries the numbers.
export const phoneReply = (line: string) =>
  'The person typed /quanta-costa, most likely on their phone, where the Quanta Costa plugin ' +
  'cannot show its band or pane. Reply with exactly this line and nothing else:\n' +
  line
const DEFAULT_EUR_RATE = 0.89238

export type Lang = 'en' | 'de'
const LOCALE: Record<Lang, string> = { en: 'en-US', de: 'de-AT' }

const toLimit = (l: SessionRateLimit): Limit => ({
  kind: l.kind,
  percentUsed: l.percentUsed,
  resetsAt: l.resetsAt,
})

// The one limit we show as "Week": weekly, else a gateway spend limit, else the 5-hour window.
export const pickPeriod = (limits: Limit[]): Limit | undefined =>
  limits.find(l => l.kind === 'seven_day') ??
  limits.find(l => l.kind === 'spend_limit') ??
  limits.find(l => l.kind === 'five_hour') ??
  limits[0]

export const bar = (percent: number): string => {
  const filled = Math.max(0, Math.min(BAR, Math.round((percent / 100) * BAR)))
  return '█'.repeat(filled) + '░'.repeat(BAR - filled)
}

const dec = (n: number, digits: number, lang: Lang) => {
  try {
    return new Intl.NumberFormat(LOCALE[lang], {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(n)
  } catch {
    const t = n.toFixed(digits)
    return lang === 'de' ? t.replace('.', ',') : t
  }
}

export const money = (usd: number | null, currency: string, eurRate: number, lang: Lang = 'en'): string => {
  if (usd === null) return '?'
  const isEur = currency === 'EUR'
  const value = dec(isEur ? usd * eurRate : usd, 2, lang)
  const sign = isEur ? '€' : '$'
  return lang === 'de' ? `${value} ${sign}` : `${sign}${value}`
}

export const tokenText = (n: number, lang: Lang = 'en'): string => {
  if (n >= 1_000_000) return lang === 'de' ? `${dec(n / 1_000_000, 1, lang)} Mio` : `${dec(n / 1_000_000, 1, lang)}M`
  if (n >= 1_000) return lang === 'de' ? `${Math.round(n / 1_000)} Tsd.` : `${Math.round(n / 1_000)}k`
  return String(n)
}

export const duration = (ms: number, lang: Lang = 'en'): string => {
  const minutes = Math.max(0, Math.round(ms / 60_000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const rest = minutes % 60
  if (lang === 'de') {
    if (days > 0) return `${days} T ${hours} h`
    if (hours > 0) return `${hours} h ${rest} min`
    return `${rest} min`
  }
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${rest}m`
  return `${rest}m`
}

export const weeks = (days: number, lang: Lang = 'en') => dec(days / 7, 1, lang)

const pct = (n: number, lang: Lang) => (lang === 'de' ? `${Math.round(n)} %` : `${Math.round(n)}%`)

// Calendar date (year, 0-based month, day) in the given time zone; undefined = this machine's.
const localDate = (ms: number, timeZone?: string) => {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(ms))
    const get = (type: string) => Number(parts.find(p => p.type === type)?.value)
    return { y: get('year'), m: get('month') - 1, d: get('day') }
  } catch {
    const t = new Date(ms)
    return { y: t.getFullYear(), m: t.getMonth(), d: t.getDate() }
  }
}

// The billing day in a given month; a day the month lacks (the 31st in November) falls on its last day.
const renewalIn = (y: number, m: number, day: number) => {
  const first = new Date(Date.UTC(y, m, 1))
  const year = first.getUTCFullYear()
  const month = first.getUTCMonth()
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return Date.UTC(year, month, Math.min(day, last))
}

export const billingPeriod = (nowMs: number, day: number, timeZone?: string) => {
  const { y, m, d } = localDate(nowMs, timeZone)
  const today = Date.UTC(y, m, d)
  const thisMonth = renewalIn(y, m, day)
  const start = today >= thisMonth ? thisMonth : renewalIn(y, m - 1, day)
  const end = today >= thisMonth ? renewalIn(y, m + 1, day) : thisMonth
  const daysTotal = Math.round((end - start) / DAY)
  const daysGone = Math.round((today - start) / DAY)
  return {
    start,
    end,
    daysTotal,
    daysGone,
    daysLeft: daysTotal - daysGone,
    percentGone: (daysGone / daysTotal) * 100,
  }
}

// "Oct 12" or "12.10.": a date-only value (UTC midnight) or an instant shown in local time.
const shortDate = (ms: number, lang: Lang, timeZone?: string) => {
  try {
    const options: Intl.DateTimeFormatOptions =
      lang === 'de' ? { timeZone, day: '2-digit', month: '2-digit' } : { timeZone, month: 'short', day: 'numeric' }
    return new Intl.DateTimeFormat(LOCALE[lang], options).format(new Date(ms))
  } catch {
    return new Date(ms).toISOString().slice(5, 10)
  }
}

// "Fri 14:00" or "Fr 14:00" in local time.
const weekdayTime = (ms: number, lang: Lang, timeZone?: string) => {
  try {
    const parts = new Intl.DateTimeFormat(LOCALE[lang], {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(ms))
    const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
    return `${get('weekday').replace('.', '')} ${get('hour')}:${get('minute')}`
  } catch {
    return new Date(ms).toISOString().slice(11, 16)
  }
}

// When a limit resets: weekday and time within the coming week, as the Claude app shows it, else the date.
export const resetText = (resetsAt: number, now: number, lang: Lang) =>
  resetsAt - now < 7 * DAY ? weekdayTime(resetsAt, lang) : shortDate(resetsAt, lang)

// Extrapolates the weekly usage so far: null while too early to tell, else whether it
// lasts until the reset or when it would run out.
export const pace = (limit: Limit, nowMs: number): { isOnTrack: boolean; runsOutAt: number } | null => {
  if (limit.kind !== 'seven_day' || !limit.resetsAt) return null
  const resetsAt = Date.parse(limit.resetsAt)
  const start = resetsAt - 7 * DAY
  const elapsed = nowMs - start
  if (elapsed < 3 * 3_600_000 || limit.percentUsed < 2) return null
  const runsOutAt = start + (elapsed * 100) / limit.percentUsed
  return { isOnTrack: runsOutAt >= resetsAt, runsOutAt }
}

// The period a session's cost is booked to: the billing period, or the calendar month without a billing day.
export const periodKey = (nowMs: number, billingDay: number, timeZone?: string) => {
  if (billingDay >= 1 && billingDay <= 31) {
    return new Date(billingPeriod(nowMs, billingDay, timeZone).start).toISOString().slice(0, 10)
  }
  const { y, m } = localDate(nowMs, timeZone)
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)
}

type Ledger = Record<string, Record<string, number>>
const LEDGER = 'ledger'
const KEEP_PERIODS = 3

// Claude's config folder: CLAUDE_CONFIG_DIR, else ~/.claude.
// Never throws: without access to the environment the plugin falls back to its own store.
const configDir = async ($: EngineInterface): Promise<string | undefined> => {
  try {
    const custom = await $.env.get('CLAUDE_CONFIG_DIR')
    if (custom) return custom
    const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
    return home ? `${home}/.claude` : undefined
  } catch {
    return undefined
  }
}

// ledger.json: the notices shown, and the amounts versions before 1.6.1 booked per session (kept as
// they are, never raised again) with the last reading each was booked at.
type Shared = { ledger?: Ledger; notices?: Notices; runs?: Runs }

// Every file comes in two copies: the file with every booking, its backup at most every ten minutes.
// A crash can leave a file just written as zero bytes; the older copy has long reached the disk by
// then, and loading merges whatever of both is readable, so at most the last minutes are lost.
const SHARED_FILE = 'ledger.json'
const BACKUP_FILE = 'ledger.backup.json'
const VALUE_FILE = 'value.json'
const VALUE_BACKUP_FILE = 'value.backup.json'
const BACKUP_EVERY = 10 * 60_000
const backedUpAt: Record<string, number> = {}

const readJson = async ($: EngineInterface, path: string): Promise<Record<string, unknown> | null> => {
  try {
    const text = await $.fs.read(path)
    if (typeof text !== 'string') return null
    const data = JSON.parse(text) as unknown
    return data !== null && typeof data === 'object' ? (data as Record<string, unknown>) : null
  } catch {
    return null
  }
}

const writeWithBackup = async ($: EngineInterface, file: string, backup: string, data: unknown) => {
  const dir = await configDir($)
  if (!dir) return
  const text = JSON.stringify(data, null, 1)
  await $.fs.write(`${dir}/quanta-costa/${file}`, text).catch(() => undefined)
  const now = await $.clock.now()
  if (now - (backedUpAt[file] ?? 0) < BACKUP_EVERY) return
  backedUpAt[file] = now
  await $.fs.write(`${dir}/quanta-costa/${backup}`, text).catch(() => undefined)
}

const loadShared = async ($: EngineInterface): Promise<Shared> => {
  const dir = await configDir($)
  if (!dir) return {}
  const main = (await readJson($, `${dir}/quanta-costa/${SHARED_FILE}`)) as Shared | null
  const backup = (await readJson($, `${dir}/quanta-costa/${BACKUP_FILE}`)) as Shared | null
  if (!main && !backup) return {}
  return {
    ledger: mergeLedgers(main?.ledger, backup?.ledger),
    notices: mergeNotices(main?.notices ?? {}, backup?.notices ?? {}),
    // The last readings belong with the ledger they were booked into: the newer copy's.
    runs: main?.runs ?? backup?.runs,
  }
}

const saveShared = ($: EngineInterface, data: Shared) => writeWithBackup($, SHARED_FILE, BACKUP_FILE, data)

// The last cost reading booked per session by versions before 1.6.1.
type Runs = Record<string, number>

// The store is only a fallback for the shared files. An unclean shutdown can leave it unreadable
// (zero bytes), which must never stop the booking: a broken store reads as empty, a failed write is skipped.
const storeGet = async ($: EngineInterface, key: string): Promise<unknown> => {
  try {
    return await $.store.get(key)
  } catch {
    return undefined
  }
}

const storeSet = async ($: EngineInterface, key: string, value: unknown) => {
  try {
    await $.store.set(key, value)
  } catch {
    // the shared file still has it
  }
}

// Two ledgers as one: per period and session the larger amount (a session's cost only grows).
export const mergeLedgers = (a: Ledger = {}, b: Ledger = {}): Ledger => {
  const out: Ledger = {}
  for (const source of [a, b]) {
    for (const [period, sessions] of Object.entries(source ?? {})) {
      const target = (out[period] ??= {})
      for (const [sid, usd] of Object.entries(sessions ?? {})) target[sid] = Math.max(num(target[sid]), num(usd))
    }
  }
  return out
}

// The amounts booked before 1.6.1: those in ledger.json, plus any session only an old
// per-name store knows (versions before 1.5.0 kept them there). A store never raises an amount.
const legacyLedger = async ($: EngineInterface, shared: Shared): Promise<Ledger> => {
  const out = mergeLedgers(shared.ledger)
  const stored = ((await storeGet($, LEDGER)) ?? {}) as Ledger
  for (const [period, sessions] of Object.entries(stored ?? {})) {
    for (const [sid, usd] of Object.entries(sessions ?? {})) {
      const target = (out[period] ??= {})
      if (!(sid in target)) target[sid] = num(usd)
    }
  }
  return out
}

// value.json, since 1.6.1: per period, session and run (one Claude Code process with Quanta Costa
// loaded) the first and the highest cost reading there. A run's cost is the difference: whatever
// Claude Code's counter carried into the run (a resumed session's earlier runs) was counted by those
// runs already. Only the run itself ever raises its entry, and copies merge by the higher reading,
// so a stale copy that another session writes back can delay a number, but never count it twice.
type RunEntry = [number, number]
type Counts = Record<string, Record<string, Record<string, RunEntry>>>
// When counting began in a period. Unknown when the period holds amounts from before 1.6.1.
type Since = Record<string, number>
type ValueDoc = { since: Since; counts: Counts }
const VALUE = 'value'

const isEntry = (e: unknown): e is RunEntry =>
  Array.isArray(e) && e.length === 2 && e.every(v => typeof v === 'number' && Number.isFinite(v))

// Two copies as one: per run the entry with the higher reading.
export const mergeCounts = (a: Counts = {}, b: Counts = {}): Counts => {
  const out: Counts = {}
  for (const source of [a, b]) {
    for (const [period, sessions] of Object.entries(source ?? {})) {
      for (const [sid, runs] of Object.entries(sessions ?? {})) {
        for (const [run, entry] of Object.entries(runs ?? {})) {
          if (!isEntry(entry)) continue
          const target = ((out[period] ??= {})[sid] ??= {})
          const had = target[run]
          if (!had || entry[1] > had[1] || (entry[1] === had[1] && entry[0] > had[0])) target[run] = [entry[0], entry[1]]
        }
      }
    }
  }
  return out
}

// Two copies as one: per period the earlier start.
export const mergeSince = (a: Since = {}, b: Since = {}): Since => {
  const out: Since = {}
  for (const source of [a, b]) {
    for (const [period, ms] of Object.entries(source ?? {})) {
      if (typeof ms === 'number' && Number.isFinite(ms)) out[period] = Math.min(out[period] ?? ms, ms)
    }
  }
  return out
}

// A period's value: the amounts from before 1.6.1 and every run's cost, except the run left out.
export const periodValue = (legacy: Record<string, number> = {}, counts: Counts[string] = {}, skip?: { sid: string; run: string }) => {
  let usd = Object.values(legacy).reduce((sum, v) => sum + num(v), 0)
  for (const [sid, runs] of Object.entries(counts)) {
    for (const [run, entry] of Object.entries(runs ?? {})) {
      if (skip && skip.sid === sid && skip.run === run) continue
      if (isEntry(entry)) usd += Math.max(0, entry[1] - entry[0])
    }
  }
  return usd
}

// A run's id starts with its start time, so the latest run of a session is known.
const newRunId = (now: number) => `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const runStart = (id: string) => {
  const start = parseInt(id.split('-')[0] ?? '', 36)
  return Number.isFinite(start) ? start : 0
}

// The session's last reading before this run: the highest reading of its latest other run, else
// the last reading a version before 1.6.1 booked for it.
export const readingBefore = (counts: Counts, oldRuns: Runs | undefined, sid: string, run: string): number | undefined => {
  let latest: { start: number; top: number } | undefined
  for (const sessions of Object.values(counts)) {
    for (const [id, entry] of Object.entries(sessions[sid] ?? {})) {
      if (id === run || !isEntry(entry)) continue
      const start = runStart(id)
      if (!latest || start > latest.start || (start === latest.start && entry[1] > latest.top)) latest = { start, top: entry[1] }
    }
  }
  if (latest) return latest.top
  const old = oldRuns?.[sid]
  return typeof old === 'number' && Number.isFinite(old) ? old : undefined
}

// This run's entry for a period after a new reading. `carried`: the run's entry in the period
// before, `before`: the session's last reading before this run.
export const nextEntry = (entry: RunEntry | undefined, carried: RunEntry | undefined, before: number | undefined, reading: number): RunEntry => {
  if (!entry) {
    // Into a new period: on from where the run left the last one.
    if (carried) return [carried[1], Math.max(carried[1], reading)]
    // A new run. A reading at or above the session's last one carries the earlier runs' cost
    // over, counted there already; a lower one is a counter that started from zero.
    return before !== undefined && reading >= before ? [before, reading] : [reading, reading]
  }
  // Started at zero and only then got the earlier runs' cost carried over.
  if (entry[0] === 0 && entry[1] === 0 && before !== undefined && before > 0 && reading >= before) return [before, reading]
  return [entry[0], Math.max(entry[1], reading)]
}

const latestPeriods = <T,>(byPeriod: Record<string, T>): Record<string, T> => {
  const out: Record<string, T> = {}
  for (const key of Object.keys(byPeriod).sort().slice(-KEEP_PERIODS)) out[key] = byPeriod[key] as T
  return out
}

const loadValue = async ($: EngineInterface): Promise<ValueDoc> => {
  const dir = await configDir($)
  const copies = [(await storeGet($, VALUE)) as Partial<ValueDoc> | undefined]
  if (dir) {
    copies.push(
      ((await readJson($, `${dir}/quanta-costa/${VALUE_FILE}`)) ?? undefined) as Partial<ValueDoc> | undefined,
      ((await readJson($, `${dir}/quanta-costa/${VALUE_BACKUP_FILE}`)) ?? undefined) as Partial<ValueDoc> | undefined,
    )
  }
  let counts: Counts = {}
  let since: Since = {}
  for (const copy of copies) {
    if (!copy || typeof copy !== 'object') continue
    counts = mergeCounts(counts, copy.counts)
    since = mergeSince(since, copy.since)
  }
  return { counts, since }
}

type Run = { sid: string; id: string; periods: Record<string, RunEntry>; since: Since }
const NO_RUN: Run = { sid: '', id: '', periods: {}, since: {} }
// This process's run. Kept here, not in the plugin state: bookings that overlap at the start must
// see the same run, and the state hands each event its own copy until that event is done.
let currentRun: Run = NO_RUN

// Books this run's reading to the current period and returns what the period's other runs and
// the amounts from before 1.6.1 add up to. Without a reading nothing is booked.
const book = async ($: EngineInterface, usd: number | null, key: string, limits: Limit[]) => {
  const sid = await $.session.id()
  const now = await $.clock.now()
  const shared = await loadShared($)
  const legacy = await legacyLedger($, shared)
  const doc = await loadValue($)
  let run: Run = currentRun.sid === sid && currentRun.id ? currentRun : { sid, id: newRunId(now), periods: {}, since: {} }
  if (usd !== null) {
    const before = readingBefore(doc.counts, shared.runs, sid, run.id)
    const earlier = Object.keys(run.periods).filter(k => k < key).sort()
    const carried = earlier.length > 0 ? run.periods[earlier[earlier.length - 1] as string] : undefined
    run = { ...run, periods: latestPeriods({ ...run.periods, [key]: nextEntry(run.periods[key], carried, before, usd) }) }
  }
  const mine: Counts = {}
  for (const [period, entry] of Object.entries(run.periods)) mine[period] = { [sid]: { [run.id]: entry } }
  const counts = latestPeriods(mergeCounts(doc.counts, mine))
  const since = mergeSince(doc.since, run.since)
  // Counting began with this booking, or with the period itself when an earlier period was counted.
  const isLegacyPeriod = Object.keys(legacy[key] ?? {}).length > 0
  const wasCounting =
    Object.keys(counts).some(k => k < key) || Object.entries(legacy).some(([k, sessions]) => k < key && Object.keys(sessions ?? {}).length > 0)
  if (usd !== null && since[key] === undefined && !isLegacyPeriod) since[key] = wasCounting ? Date.parse(`${key}T00:00:00Z`) : now
  run = { ...run, since: latestPeriods(since) }
  currentRun = run
  const next: ValueDoc = { since: latestPeriods(since), counts }
  await storeSet($, VALUE, next)
  await writeWithBackup($, VALUE_FILE, VALUE_BACKUP_FILE, next)
  const totals: Record<string, number> = {}
  for (const period of new Set([...Object.keys(legacy), ...Object.keys(counts)])) {
    totals[period] = periodValue(legacy[period], counts[period])
  }
  // The period before this one, for the look back that stays in the help and the pane.
  const earlier = Object.keys(totals).filter(k => k < key).sort()
  const lastKey = earlier[earlier.length - 1]
  const own = run.periods[key]
  return {
    prevPeriod: lastKey ?? null,
    prevUsd: lastKey ? (totals[lastKey] ?? null) : null,
    prevSince: lastKey ? (since[lastKey] ?? null) : null,
    othersUsd: periodValue(legacy[key], counts[key], { sid, run: run.id }),
    ownFirst: own ? own[0] : null,
    ownTop: own ? own[1] : 0,
    since: since[key] ?? null,
    ...(await weekSoFar($, limits, totals)),
  }
}

// week.json: the value of every period and the weekly percentage when Quanta Costa first saw the
// current week. What was added since, divided by the percentage points used since, is what one
// percent of the week is worth. Its own file: versions before 1.7.0 rewrite value.json without it.
type WeekBase = { resetsAt: number; percent: number; values: Record<string, number> }
const WEEK_FILE = 'week.json'
const WEEK_BACKUP_FILE = 'week.backup.json'
const WEEK_BASE = 'weekBase'
// Shown from 3 points on, so a first reading does not swing the number.
const WEEK_MIN_POINTS = 3

const isWeekBase = (w: unknown): w is WeekBase => {
  const b = w as Partial<WeekBase> | null | undefined
  return (
    !!b &&
    typeof b.resetsAt === 'number' &&
    Number.isFinite(b.resetsAt) &&
    typeof b.percent === 'number' &&
    Number.isFinite(b.percent) &&
    !!b.values &&
    typeof b.values === 'object'
  )
}

// Two copies as one: the later week; within one week the earlier look, with the lower percentage.
export const mergeWeekBase = (a: unknown, b: unknown): WeekBase | undefined => {
  if (!isWeekBase(a)) return isWeekBase(b) ? b : undefined
  if (!isWeekBase(b)) return a
  if (!isSameWeek(a.resetsAt, b.resetsAt)) return a.resetsAt > b.resetsAt ? a : b
  if (a.percent !== b.percent) return a.percent < b.percent ? a : b
  const values: Record<string, number> = { ...b.values }
  for (const [period, usd] of Object.entries(a.values)) values[period] = Math.min(values[period] ?? num(usd), num(usd))
  return { ...a, values }
}

// What the week added: per period the value now less the value at the first look.
export const weekAdded = (base: WeekBase, totals: Record<string, number>) =>
  Object.entries(totals).reduce((sum, [period, usd]) => sum + Math.max(0, usd - num(base.values[period])), 0)

// API value per percentage point of the weekly limit, once enough of the week is used.
export const perPercent = (weekUsd: number | null, points: number) =>
  weekUsd !== null && points >= WEEK_MIN_POINTS && weekUsd > 0 ? weekUsd / points : null

const loadWeekBase = async ($: EngineInterface) => {
  const dir = await configDir($)
  let base = mergeWeekBase(await storeGet($, WEEK_BASE), undefined)
  if (dir) {
    base = mergeWeekBase(base, await readJson($, `${dir}/quanta-costa/${WEEK_FILE}`))
    base = mergeWeekBase(base, await readJson($, `${dir}/quanta-costa/${WEEK_BACKUP_FILE}`))
  }
  return base
}

// The week so far: added value and percentage points since the first look at this week.
const weekSoFar = async ($: EngineInterface, limits: Limit[], totals: Record<string, number>) => {
  const week = limits.find(l => l.kind === 'seven_day')
  if (!week?.resetsAt) return { weekUsd: null, weekPoints: 0 }
  const resetsAt = Date.parse(week.resetsAt)
  let base = await loadWeekBase($)
  if (base && !isSameWeek(base.resetsAt, resetsAt) && base.resetsAt > resetsAt) return { weekUsd: null, weekPoints: 0 }
  const first: WeekBase = { resetsAt, percent: week.percentUsed, values: totals }
  const merged = mergeWeekBase(base, first) as WeekBase
  if (!base || JSON.stringify(merged) !== JSON.stringify(base)) {
    await storeSet($, WEEK_BASE, merged)
    await writeWithBackup($, WEEK_FILE, WEEK_BACKUP_FILE, merged)
  }
  base = merged
  return { weekUsd: weekAdded(base, totals), weekPoints: Math.max(0, week.percentUsed - base.percent) }
}

// One booking at a time: two at once, at the very start, would each begin a run of their own.
let booking: Promise<unknown> = Promise.resolve()
const oneAtATime = <T,>(task: () => Promise<T>): Promise<T> => {
  const next = booking.then(task, task)
  booking = next.catch(() => undefined)
  return next
}

// With a plan price set: book this session's cost and learn what the period's others cost.
const bookPeriod = ($: EngineInterface, planPrice: number, billingDay: number) =>
  oneAtATime(async () => {
    if (planPrice <= 0) return
    const { usd, limits } = normalize(await read($, snap))
    const now = await $.clock.now()
    const booked = await book($, usd, periodKey(now, billingDay), limits)
    await update($, snap, s => ({ ...normalize(s), ...booked }))
  })

// A period's whole value, for the look back once it has ended.
const valueOf = async ($: EngineInterface, key: string) => {
  const legacy = await legacyLedger($, await loadShared($))
  const doc = await loadValue($)
  if (!legacy[key] && !doc.counts[key]) return null
  return periodValue(legacy[key], doc.counts[key])
}

type Texts = {
  names: Record<string, string>
  period: string
  session: string
  value: string
  periodLine: (gone: string, total: string, left: string, days: number) => string
  weekLine: (used: string, free: string) => string
  onTrack: string
  runsOut: (when: string) => string
  resets: (date: string) => string
  perPercent: (value: string) => string
  noReading: string
  sessionMain: (tokens: string, cost: string) => string
  sessionLast: (cost: string, tokens: string) => string
  help: string
  closeHelp: string
  valueLine: (value: string, plan: string, since?: string) => string
  shortWarn: (percent: string, freeIn?: string) => string
  helpTitle: string
  helpPeriod: (day: number, start: string, end: string) => string
  helpPeriodUnset: string
  helpWeek: string
  helpFive: string
  helpHypothetical: string
  helpReal: string
  helpTokens: string
  helpLast: string
  helpPace: string
  helpPerPercent: string
  helpValue: string
  helpEuro: (rate: string) => string
  helpNotices: string
  commandDescription: string
  helpActive: (billingDay: string, currency: string, plan: string) => string
  warnWeek: (percent: string, resets: string, runsOut?: string) => string
  freshWeek: (free: string) => string
  review: (start: string, end: string, value: string, ratio?: string) => string
  lastPeriodLine: (start: string, end: string, value: string, ratio: string, since?: string) => string
}

const TEXTS: Record<Lang, Texts> = {
  en: {
    names: { seven_day: 'Week', spend_limit: 'Spend', five_hour: '5 hours' },
    period: 'Period',
    session: 'Session',
    value: 'Value',
    periodLine: (gone, total, left, days) =>
      `${gone} of ${total} weeks gone · ${left} wk left · renews in ${days} ${days === 1 ? 'day' : 'days'}`,
    weekLine: (used, free) => `${used} used · ${free} free`,
    onTrack: '· on track',
    runsOut: when => `· runs out ${when}`,
    resets: date => `(resets ${date})`,
    perPercent: value => `· 1% ≈ ${value} value`,
    noReading: 'Week: no reading yet, it appears with the next reply.',
    sessionMain: (tokens, cost) => `${tokens} tokens · ${cost}`,
    sessionLast: (cost, tokens) => `· last prompt ${cost} · ${tokens} tokens`,
    help: 'Help',
    closeHelp: 'Close help',
    valueLine: (value, plan, since) => `${value} API value${since ? ` since ${since}` : ''} vs ${plan} plan`,
    shortWarn: (percent, freeIn) => `5-hour limit ${percent} used` + (freeIn ? ` · resets in ${freeIn}` : ''),
    helpTitle: 'Quanta Costa: what the numbers mean',
    helpPeriod: (day, start, end) =>
      `Period: your Claude subscription renews on day ${day} of each month, this period runs ${start} to ${end}. The top bar shows how many weeks of this paid month are gone and how many are left. Every new week brings a fresh weekly allowance.`,
    helpPeriodUnset:
      'Period: set your billing day in the settings (billingDay, it is on your Anthropic receipt). A bar on top then shows how much of your paid month is gone.',
    helpWeek:
      'Week: your plan has a weekly allowance. The bar shows how much of it is used. When it is full, you wait for the reset.',
    helpFive:
      '5-hour limit: there is also a short 5-hour window. It only shows up here, as a warning, once it passes 80%.',
    helpHypothetical:
      'Costs are hypothetical: this is what the session would cost at API list prices. On a subscription you do not pay this on top, it only counts against your weekly allowance. You only really pay for extra usage beyond your limit, if you turned it on.',
    helpReal:
      'No subscription limits reported: this session probably runs on an API key. Then the costs are real and billed.',
    helpTokens:
      "Tokens: everything the model read and wrote, cache included, counted since Quanta Costa started. The cost is Claude Code's own figure for this session, as in /cost; a resumed session can carry its earlier cost over.",
    helpLast: 'Last prompt: everything since your last prompt.',
    helpPerPercent:
      '1% ≈: the API value one percent of your weekly limit has bought this week, from the sessions where Quanta Costa ran. It shows once 3% more of the week are used. Chats on claude.ai and other devices use the limit too, so one percent is worth at least that much.',
    helpPace:
      'Pace: Quanta Costa extrapolates your usage so far this week. "on track" means it lasts until the reset, otherwise it shows when it would run out.',
    helpValue:
      'Value: the API value of all sessions in this period, counted while Quanta Costa ran, against your plan price. Above 1× your plan has paid for itself. "since" shows the day Quanta Costa started counting, when that was after the period began. A resumed session never counts twice.',
    helpEuro: rate => `Euro: converted at $1 = €${rate} (setting eurRate).`,
    helpNotices:
      'Notices: Quanta Costa tells you once when the week passes 80% and 90%, when a fresh week starts, and at the end of each period how much it was worth.',
    commandDescription: 'Show Quanta Costa: usage limits, pace and session cost',
    helpActive: (billingDay, currency, plan) =>
      `Active settings: language en · billing day ${billingDay} · ${currency} · plan ${plan} · version ${VERSION}`,
    warnWeek: (percent, resets, runsOut) =>
      `Quanta Costa: ${percent} of your weekly limit used, it resets ${resets}.` +
      (runsOut ? ` At this pace it runs out ${runsOut}.` : ''),
    freshWeek: free => `Quanta Costa: fresh week, your weekly limit has reset (${free} free).`,
    lastPeriodLine: (start, end, value, ratio, since) =>
      `Last period ${start} to ${end}: ${value} API value${since ? ` since ${since}` : ''} (${ratio}×)`,
    review: (start, end, value, ratio) =>
      `Quanta Costa: last period ${start} to ${end}: ${value} API value` + (ratio ? `, ${ratio}× your plan.` : '.'),
  },
  de: {
    names: { seven_day: 'Woche', spend_limit: 'Limit', five_hour: '5 Std.' },
    period: 'Periode',
    session: 'Sitzung',
    value: 'Wert',
    periodLine: (gone, total, left, days) =>
      `${gone} v. ${total} Wochen vorbei · ${left} W offen · noch ${days} ${days === 1 ? 'Tag' : 'Tage'}`,
    weekLine: (used, free) => `${used} verbraucht · ${free} frei`,
    onTrack: '· im Plan',
    runsOut: when => `· leer ab ${when}`,
    resets: date => `(neu ab ${date})`,
    perPercent: value => `· 1 % ≈ ${value} Wert`,
    noReading: 'Woche: noch keine Messung, kommt mit der nächsten Antwort.',
    sessionMain: (tokens, cost) => `${tokens} Tokens · ${cost}`,
    sessionLast: (cost, tokens) => `· zuletzt ${cost} · ${tokens} Tokens`,
    help: 'Hilfe',
    closeHelp: 'Hilfe zu',
    valueLine: (value, plan, since) => `${value} API-Wert${since ? ` seit ${since}` : ''} vs. ${plan} Abo`,
    shortWarn: (percent, freeIn) => `Kurzzeit-Bremse ${percent} voll` + (freeIn ? ` · frei in ${freeIn}` : ''),
    helpTitle: 'Quanta Costa: was die Zahlen bedeuten',
    helpPeriod: (day, start, end) =>
      `Periode: Dein Claude-Abo wird jeden Monat am ${day}. abgebucht, aktuell ${start} bis ${end}. Der obere Balken zeigt, wie viele Wochen dieses bezahlten Monats schon vorbei sind und wie viele noch offen. Jede neue Woche bringt ein frisches Wochenkontingent. W = Wochen.`,
    helpPeriodUnset:
      'Periode: Trag in den Einstellungen deinen Abrechnungstag ein (billingDay, steht auf deiner Anthropic-Rechnung). Dann zeigt ein Balken ganz oben, wie viel von deinem bezahlten Monat vorbei ist.',
    helpWeek:
      'Woche: Dein Abo hat ein Kontingent pro Woche. Der Balken zeigt, wie viel davon schon weg ist. Ist er voll, geht erst nach dem Reset wieder etwas.',
    helpFive:
      'Kurzzeit-Bremse: Zusätzlich gibt es ein 5-Stunden-Fenster. Es erscheint hier nur als Warnung, wenn es über 80 % liegt.',
    helpHypothetical:
      'Kosten sind theoretisch: So viel würde die Sitzung zum API-Listenpreis kosten. Mit deinem Abo zahlst du das nicht extra, es zählt nur gegen dein Wochenkontingent. Echt bezahlt wird nur Extra-Nutzung über das Limit hinaus, falls du sie aktiviert hast.',
    helpReal:
      'Keine Abo-Limits gemeldet: Vermutlich läuft die Sitzung über einen API-Schlüssel. Dann sind die Kosten echt und werden abgerechnet.',
    helpTokens:
      'Tokens: alles, was das Modell gelesen und geschrieben hat, inklusive Cache. Gezählt ab dem Start von Quanta Costa. Der Betrag ist Claude Codes eigene Zahl für diese Sitzung, wie bei /cost; eine fortgesetzte Sitzung kann ihre früheren Kosten mitbringen.',
    helpLast: 'Zuletzt: alles seit deinem letzten Prompt.',
    helpPerPercent:
      '1 % ≈: der API-Wert, den ein Prozent deines Wochenlimits diese Woche gebracht hat, aus den Sitzungen, in denen Quanta Costa lief. Erscheint, sobald 3 % mehr der Woche verbraucht sind. Chats auf claude.ai und andere Geräte verbrauchen das Limit mit, ein Prozent ist also mindestens so viel wert.',
    helpPace:
      'Tempo: Quanta Costa rechnet deinen bisherigen Wochenverbrauch hoch. „im Plan" heißt, es reicht bis zum Reset. Sonst steht da, wann das Kontingent leer wäre.',
    helpValue:
      'Wert: der API-Wert aller Sitzungen dieser Periode, gezählt solange Quanta Costa lief, im Vergleich zu deinem Abo-Preis. Über 1× hat sich dein Abo bezahlt gemacht. „seit" nennt den Tag, ab dem Quanta Costa zählt, wenn das nach Periodenbeginn war. Eine fortgesetzte Sitzung zählt nie doppelt.',
    helpEuro: rate => `Euro: umgerechnet mit 1 $ = ${rate} € (Einstellung eurRate).`,
    helpNotices:
      'Hinweise: Quanta Costa meldet sich je einmal, wenn die Woche 80 % und 90 % erreicht, wenn eine neue Woche startet und am Ende jeder Periode mit ihrem Wert.',
    commandDescription: 'Quanta Costa anzeigen: Limits, Tempo und Sitzungskosten',
    helpActive: (billingDay, currency, plan) =>
      `Aktive Einstellungen: Sprache de · Abrechnungstag ${billingDay} · ${currency} · Abo ${plan} · Version ${VERSION}`,
    warnWeek: (percent, resets, runsOut) =>
      `Quanta Costa: ${percent} deines Wochenlimits verbraucht, neu ab ${resets}.` +
      (runsOut ? ` Bei diesem Tempo leer ab ${runsOut}.` : ''),
    freshWeek: free => `Quanta Costa: neue Woche, dein Wochenlimit ist zurückgesetzt (${free} frei).`,
    lastPeriodLine: (start, end, value, ratio, since) =>
      `Letzte Periode ${start} bis ${end}: ${value} API-Wert${since ? ` seit ${since}` : ''} (${ratio}×)`,
    review: (start, end, value, ratio) =>
      `Quanta Costa: letzte Periode ${start} bis ${end}: ${value} API-Wert` + (ratio ? `, ${ratio}× dein Abo.` : '.'),
  },
}

type Notices = { week?: number; level?: number; seenPeriod?: string }
type NoticeOptions = { lang: Lang; planPrice: number; billingDay: number; currency: string; eurRate: number }
const NOTICES = 'notices'

// The notices already shown, from the store and the shared file: the later week, its higher level.
export const mergeNotices = (a: Notices = {}, b: Notices = {}): Notices => {
  const weekA = num(a.week)
  const weekB = num(b.week)
  const later = weekB > weekA ? b : a
  const sameWeek = weekA > 0 && weekB > 0 && Math.abs(weekA - weekB) < DAY
  const out: Notices = {}
  if (later.week !== undefined) out.week = later.week
  const level = sameWeek ? Math.max(num(a.level), num(b.level)) : num(later.level)
  if (later.level !== undefined || sameWeek) out.level = level
  const seen = [a.seenPeriod, b.seenPeriod].filter((v): v is string => typeof v === 'string').sort()
  if (seen.length > 0) out.seenPeriod = seen[seen.length - 1]
  return out
}

// Two readings belong to the same week when their reset times lie within a day of each other.
export const isSameWeek = (a: number, b: number) => Math.abs(a - b) < DAY

// Shows each notice once (remembered across sessions): 80% and 90% of the week, a fresh week,
// and a look back at the period that just ended.
const notify = async ($: EngineInterface, o: NoticeOptions) => {
  const t = TEXTS[o.lang]
  const s = normalize(await read($, snap))
  const now = s.now || (await $.clock.now())
  const shared = await loadShared($)
  const stored = mergeNotices(((await storeGet($, NOTICES)) ?? {}) as Notices, shared.notices)
  const next: Notices = { ...stored }
  const toasts: string[] = []

  const week = s.limits.find(l => l.kind === 'seven_day')
  if (week?.resetsAt) {
    const resetsAt = Date.parse(week.resetsAt)
    const known = typeof stored.week === 'number' ? stored.week : null
    const isKnownWeek = known !== null && isSameWeek(known, resetsAt)
    if (known !== null && !isKnownWeek && resetsAt > known) {
      toasts.push(t.freshWeek(pct(Math.max(0, 100 - week.percentUsed), o.lang)))
    }
    const level = week.percentUsed >= 90 ? 90 : week.percentUsed >= 80 ? 80 : 0
    const shownLevel = isKnownWeek ? num(stored.level) : 0
    if (level > shownLevel) {
      const forecast = pace(week, now)
      toasts.push(
        t.warnWeek(
          pct(week.percentUsed, o.lang),
          resetText(resetsAt, now, o.lang),
          forecast && !forecast.isOnTrack ? weekdayTime(forecast.runsOutAt, o.lang) : undefined,
        ),
      )
    }
    next.week = resetsAt
    next.level = Math.max(level, shownLevel)
  }

  if (o.planPrice > 0) {
    const key = periodKey(now, o.billingDay)
    const seen = stored.seenPeriod
    if (seen && seen < key) {
      const usd = await valueOf($, seen)
      if (usd !== null) {
        const planUsd = o.currency === 'EUR' ? o.planPrice / o.eurRate : o.planPrice
        toasts.push(
          t.review(
            shortDate(Date.parse(`${seen}T00:00:00Z`), o.lang, 'UTC'),
            shortDate(Date.parse(`${key}T00:00:00Z`), o.lang, 'UTC'),
            money(usd, o.currency, o.eurRate, o.lang),
            dec(usd / planUsd, 1, o.lang),
          ),
        )
      }
    }
    next.seenPeriod = key
  }

  if (JSON.stringify(next) !== JSON.stringify(stored)) {
    await storeSet($, NOTICES, next)
    await saveShared($, { ...(await loadShared($)), notices: next })
  }
  for (const text of toasts) $.ui.toast(text, { timeoutMs: 12_000 })
}

const colorFor = (percentUsed: number) =>
  percentUsed >= 90 ? 'error' : percentUsed >= 70 ? 'warning' : 'success'

const refresh = async ($: EngineInterface) => {
  const usage = await $.session.usage()
  const now = await $.clock.now()
  await update($, snap, s => ({
    ...normalize(s),
    limits: usage.rateLimits.length > 0 ? usage.rateLimits.map(toLimit) : normalize(s).limits,
    usd: usage.cost?.usd ?? normalize(s).usd,
    now,
  }))
}

type Settings = {
  billingDay: number
  currency: 'USD' | 'EUR'
  eurRate: number
  planPrice: number
  lang: Lang
  openPane: boolean
}

const asNumber = (v: unknown): number | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return undefined
}

export const toSettings = (o: Record<string, unknown>): Settings => ({
  billingDay: Math.round(asNumber(o.billingDay) ?? 0),
  currency: o.currency === 'EUR' ? 'EUR' : 'USD',
  eurRate: asNumber(o.eurRate) ?? DEFAULT_EUR_RATE,
  planPrice: asNumber(o.planPrice) ?? 0,
  lang: o.language === 'de' ? 'de' : 'en',
  // On unless switched off: the pane opens beside the chat at every start.
  openPane: !(o.openPane === false || o.openPane === 'false' || o.openPane === 'off'),
})

export const isAllDefault = (c: Settings) =>
  c.billingDay === 0 &&
  c.currency === 'USD' &&
  c.planPrice === 0 &&
  c.lang === 'en' &&
  c.eurRate === DEFAULT_EUR_RATE &&
  c.openPane

// Claude Code hands a plugin the options stored under the name it loaded the plugin by. The desktop
// app loads a plugin installed from a local folder as "quanta-costa@inline", while `claude plugin
// configure` stores the options as "quanta-costa@<marketplace>", so only defaults arrive. In that case
// look up this plugin's own entry in the settings file, under any of its names. Nothing else is read.
export const findSavedOptions = async ($: EngineInterface): Promise<Record<string, unknown> | null> => {
  const dir = await configDir($)
  if (!dir) return null
  const text = await $.fs.read(`${dir}/settings.json`)
  if (typeof text !== 'string') return null
  const parsed = JSON.parse(text) as { pluginConfigs?: Record<string, { options?: Record<string, unknown> }> }
  const configs = parsed.pluginConfigs ?? {}
  const keys = Object.keys(configs).filter(k => k === PLUGIN || k.startsWith(`${PLUGIN}@`))
  for (const key of keys) {
    const found = configs[key]?.options
    if (found && Object.keys(found).length > 0) return found
  }
  return null
}

// The calendar day of an instant, as "2026-10-09", in this machine's time zone.
const localDay = (ms: number) => {
  const { y, m, d } = localDate(ms)
  return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10)
}

// When counting began in this period, worth saying only when that was after the period started.
export const countedSince = (since: number | null, now: number, billingDay: number) => {
  if (since === null) return null
  const key = periodKey(now, billingDay)
  if (periodKey(since, billingDay) !== key) return null
  return localDay(since) > key ? since : null
}

// The period before this one: when it ran, what it was worth, and since when it was counted.
export const previousPeriod = (s: Snapshot, billingDay: number, planUsd: number) => {
  if (s.prevPeriod === null || s.prevUsd === null || planUsd <= 0) return null
  const start = Date.parse(`${s.prevPeriod}T00:00:00Z`)
  const first = new Date(start)
  const end =
    billingDay >= 1 && billingDay <= 31
      ? billingPeriod(start + DAY / 2, billingDay, 'UTC').end
      : Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1)
  const since = s.prevSince !== null && localDay(s.prevSince) > s.prevPeriod ? s.prevSince : null
  return { start, end, usd: s.prevUsd, ratio: s.prevUsd / planUsd, since }
}

// Everything the view shows, worked out once for the band, the pane and the text summary.
export const figures = (s: Snapshot, cfg: Settings, now: number) => {
  const { billingDay, currency, eurRate, planPrice } = cfg
  const week = pickPeriod(s.limits)
  const short = s.limits.find(l => l.kind === 'five_hour')
  // The other runs, plus this run's cost up to the live reading.
  const ownUsd = s.ownFirst === null ? 0 : Math.max(0, Math.max(s.ownTop, s.usd ?? 0) - s.ownFirst)
  const periodUsd = s.othersUsd + ownUsd
  // This run's live reading moves the week on too.
  const ownSinceBooked = s.ownFirst === null ? 0 : Math.max(0, (s.usd ?? 0) - s.ownTop)
  const weekUsd = s.weekUsd === null ? null : s.weekUsd + ownSinceBooked
  const planUsd = currency === 'EUR' ? planPrice / eurRate : planPrice
  return {
    week,
    short,
    isShortTight: short !== undefined && short !== week && short.percentUsed >= 80,
    isSubscription: s.limits.length > 0,
    lastUsd: s.usd === null ? null : Math.max(0, s.usd - s.baseUsd),
    lastTokens: Math.max(0, s.tokens - s.baseTokens),
    period: billingDay >= 1 && billingDay <= 31 ? billingPeriod(now, billingDay) : null,
    forecast: week ? pace(week, now) : null,
    periodUsd,
    planUsd,
    valueRatio: planPrice > 0 ? periodUsd / planUsd : null,
    since: countedSince(s.since, now, billingDay),
    perPercent: week?.kind === 'seven_day' ? perPercent(weekUsd, s.weekPoints) : null,
    last: planPrice > 0 ? previousPeriod(s, billingDay, planUsd) : null,
  }
}

// "Last period Sep 29 to Oct 29: €6,366.48 API value since Oct 9 (35.4×)"
const lastLine = (f: ReturnType<typeof figures>, cfg: Settings) => {
  if (!f.last) return null
  const { currency, eurRate, lang } = cfg
  return TEXTS[lang].lastPeriodLine(
    shortDate(f.last.start, lang, 'UTC'),
    shortDate(f.last.end, lang, 'UTC'),
    money(f.last.usd, currency, eurRate, lang),
    dec(f.last.ratio, 1, lang),
    f.last.since !== null ? shortDate(f.last.since, lang) : undefined,
  )
}

// The view as one line of text, the answer where no pane can be drawn, such as the phone.
// One line, because Claude Code shows a dropped prompt's reason without line breaks.
export const summaryText = (s: Snapshot, cfg: Settings, now: number): string => {
  const { currency, eurRate, lang } = cfg
  const t = TEXTS[lang]
  const f = figures(s, cfg, now)
  const lines = [`${LOGO} Quanta Costa`]
  if (f.period) {
    const { daysGone, daysTotal, daysLeft } = f.period
    lines.push(`${t.period}: ${t.periodLine(weeks(daysGone, lang), weeks(daysTotal, lang), weeks(daysLeft, lang), daysLeft)}`)
  }
  if (f.week) {
    const free = pct(Math.max(0, 100 - Math.round(f.week.percentUsed)), lang)
    const parts = [`${t.names[f.week.kind] ?? f.week.kind}: ${t.weekLine(pct(f.week.percentUsed, lang), free)}`]
    if (f.forecast) parts.push(f.forecast.isOnTrack ? t.onTrack : t.runsOut(weekdayTime(f.forecast.runsOutAt, lang)))
    if (f.week.resetsAt) parts.push(t.resets(resetText(Date.parse(f.week.resetsAt), now, lang)))
    if (f.perPercent !== null) parts.push(t.perPercent(money(f.perPercent, currency, eurRate, lang)))
    lines.push(parts.join(' '))
  } else {
    lines.push(t.noReading)
  }
  const cost = money(s.usd, currency, eurRate, lang)
  const last = t.sessionLast(money(f.lastUsd, currency, eurRate, lang), tokenText(f.lastTokens, lang))
  lines.push(`${t.session}: ${t.sessionMain(tokenText(s.tokens, lang), cost)} ${last}`)
  if (f.valueRatio !== null) {
    const since = f.since !== null ? shortDate(f.since, lang) : undefined
    const value = t.valueLine(money(f.periodUsd, currency, eurRate, lang), money(f.planUsd, currency, eurRate, lang), since)
    lines.push(`${t.value}: ${value} (${dec(f.valueRatio, 1, lang)}×)`)
    const last = lastLine(f, cfg)
    if (last) lines.push(last)
  }
  if (f.isShortTight && f.short) {
    const freeIn = f.short.resetsAt ? duration(Date.parse(f.short.resetsAt) - now, lang) : undefined
    lines.push(t.shortWarn(pct(f.short.percentUsed, lang), freeIn))
  }
  return lines.join(' | ')
}

// /quanta-costa: opens the pane where one can be drawn and answers with the view as text,
// which every surface shows, the phone included.
const showView = async ($: EngineInterface, cfg: Settings) => {
  await $.ui.open({ id: PANE, title: 'Quanta Costa' }).catch(() => undefined)
  const s = normalize(await read($, snap))
  return summaryText(s, cfg, s.now || (await $.clock.now()))
}

export const register: Register = (on, options) => {
  let cfg = toSettings(options as Record<string, unknown>)
  const noticeOptions = (): NoticeOptions => ({
    lang: cfg.lang,
    planPrice: cfg.planPrice,
    billingDay: cfg.billingDay,
    currency: cfg.currency,
    eurRate: cfg.eurRate,
  })

  on('session.start', async ($, e, next) => {
    if (isAllDefault(cfg)) {
      const saved = await findSavedOptions($).catch(() => null)
      if (saved) {
        cfg = toSettings(saved)
        $.ui.invalidate('ui.render')
      }
    }
    await $.command
      .register({ name: PANE, description: TEXTS[cfg.lang].commandDescription })
      .catch(() => undefined)
    if (cfg.openPane) await $.ui.open({ id: PANE, title: 'Quanta Costa' }).catch(() => undefined)
    await refresh($).catch(() => undefined)
    // Loaded mid-session: "last prompt" starts at zero, not at the whole session.
    await update($, snap, s => {
      const f = normalize(s)
      return f.baseUsd === 0 ? { ...f, baseUsd: f.usd ?? 0 } : f
    })
    await bookPeriod($, cfg.planPrice, cfg.billingDay).catch(() => undefined)
    await notify($, noticeOptions()).catch(() => undefined)
    $.clock.every(60_000, () => {
      void $.clock.now().then(now => update($, snap, s => ({ ...normalize(s), now })))
    })
    return next(e)
  })

  // A new prompt starts a new "last prompt" count.
  on('prompt.submit', async ($, e, next) => {
    // The Claude mobile app sends "/quanta-costa" as plain text instead of running the command,
    // and draws no pane, toast or dropped prompt's reason. What it does show is Claude's reply:
    // so the numbers go along as context, and Claude answers with them.
    let event = e
    if (isPaneRequest(e.text)) {
      const s = normalize(await read($, snap))
      const line = summaryText(s, cfg, s.now || (await $.clock.now()))
      event = { ...e, context: [...(e.context ?? []), phoneReply(line)] }
    }
    const usage = await $.session.usage()
    await update($, snap, s => ({
      ...normalize(s),
      usd: usage.cost?.usd ?? normalize(s).usd,
      baseUsd: usage.cost?.usd ?? normalize(s).usd ?? 0,
      baseTokens: normalize(s).tokens,
    }))
    return next(event)
  })

  // Refresh the cost after every tool call so the number moves live.
  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    await refresh($).catch(() => undefined)
    return result
  })

  // Sum the tokens of every turn, subagents included.
  on('turn.complete', async ($, e, next) => {
    const u = e.usage
    if (u) {
      const sum =
        u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
      await update($, snap, s => {
        const f = normalize(s)
        return { ...f, tokens: f.tokens + sum }
      })
    }
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, snap, s => ({
      ...normalize(s),
      limits: e.rateLimits.length > 0 ? e.rateLimits.map(toLimit) : normalize(s).limits,
      usd: e.cost?.usd ?? normalize(s).usd,
      now,
    }))
    await bookPeriod($, cfg.planPrice, cfg.billingDay).catch(() => undefined)
    await notify($, noticeOptions()).catch(() => undefined)
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') await update($, snap, () => EMPTY)
    return next(e)
  })

  on('command.run', { command: PANE }, async $ => ({ text: await showView($, cfg) }))

  on('ui.render', { component: ['AbovePrompt', 'Pane'] }, async ($, e, next) => {
    if (e.component === 'Pane' && e.requestId !== PANE) return next(e)
    if (e.component === 'AbovePrompt' && e.props.hasSurvey) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const { billingDay, currency, eurRate, planPrice, lang } = cfg
    const t = TEXTS[lang]
    const s = normalize(await read($, snap))
    const isOpen = await read($, isHelpOpen)
    const now = s.now || (await $.clock.now())

    const shown = figures(s, cfg, now)
    const { week, short, isShortTight, isSubscription, lastUsd, lastTokens, period, forecast, periodUsd, planUsd, valueRatio, since, perPercent } =
      shown
    const last = lastLine(shown, cfg)

    const off = lang === 'de' ? 'aus' : 'off'

    // "Title: body" on one line, the title in bold.
    const helpItem = (text: string, color?: 'success' | 'warning') => {
      const cut = text.indexOf(': ')
      if (cut <= 0) return <Text>{text}</Text>
      const title = text.slice(0, cut + 1)
      const body = ` ${text.slice(cut + 2)}`
      return color ? (
        <Text>
          <Text bold color={color}>
            {title}
          </Text>
          {body}
        </Text>
      ) : (
        <Text>
          <Text bold>{title}</Text>
          {body}
        </Text>
      )
    }

    // A blank line before each topic, so the help stays easy to read.
    const spaced = (items: (ReturnType<typeof helpItem> | null)[]) =>
      items.flatMap(item => (item === null ? [] : [<Text>{' '}</Text>, item]))

    const label = (text: string) => (
      <Box width={8} flexShrink={0}>
        <Text bold>{text}</Text>
      </Box>
    )

    return (
      <Box>
        <Box key="logo" width={3} flexShrink={0}>
          <Text>{LOGO}</Text>
        </Box>
        <Box flexDirection="column">
        {period ? (
          <Box key="period" gap={1}>
            {label(t.period)}
            <Text color="suggestion">{bar(period.percentGone)}</Text>
            <Text>
              {t.periodLine(
                weeks(period.daysGone, lang),
                weeks(period.daysTotal, lang),
                weeks(period.daysLeft, lang),
                period.daysLeft,
              )}
            </Text>
          </Box>
        ) : null}

        {week ? (
          <Box key="week" gap={1}>
            {label(t.names[week.kind] ?? week.kind)}
            <Text color={colorFor(week.percentUsed)}>{bar(week.percentUsed)}</Text>
            <Text>
              {t.weekLine(pct(week.percentUsed, lang), pct(Math.max(0, 100 - Math.round(week.percentUsed)), lang))}
            </Text>
            {forecast ? (
              <Text color={forecast.isOnTrack ? 'success' : 'warning'}>
                {forecast.isOnTrack ? t.onTrack : t.runsOut(weekdayTime(forecast.runsOutAt, lang))}
              </Text>
            ) : null}
            {week.resetsAt ? <Text>{t.resets(resetText(Date.parse(week.resetsAt), now, lang))}</Text> : null}
            {perPercent !== null ? <Text dimColor>{t.perPercent(money(perPercent, currency, eurRate, lang))}</Text> : null}
          </Box>
        ) : (
          <Text dimColor>{t.noReading}</Text>
        )}

        <Box key="session" gap={1}>
          {label(t.session)}
          <Text>{t.sessionMain(tokenText(s.tokens, lang), money(s.usd, currency, eurRate, lang))}</Text>
          <Text dimColor>{t.sessionLast(money(lastUsd, currency, eurRate, lang), tokenText(lastTokens, lang))}</Text>
          <Button
            key="help"
            hotkey="h"
            label={isOpen ? t.closeHelp : t.help}
            onPress={() => update($, isHelpOpen, open => !open)}
          />
        </Box>

        {valueRatio !== null ? (
          <Box key="value" gap={1}>
            {label(t.value)}
            <Text color={valueRatio >= 1 ? 'success' : 'suggestion'}>{bar(valueRatio * 100)}</Text>
            <Text>
              {t.valueLine(
                money(periodUsd, currency, eurRate, lang),
                money(planUsd, currency, eurRate, lang),
                since !== null ? shortDate(since, lang) : undefined,
              )}
            </Text>
            {valueRatio >= 1 ? (
              <Text color="success" bold>{`(${dec(valueRatio, 1, lang)}×)`}</Text>
            ) : (
              <Text>{`(${dec(valueRatio, 1, lang)}×)`}</Text>
            )}
          </Box>
        ) : null}

        {e.component === 'Pane' && last ? (
          <Box key="last" gap={1}>
            <Text dimColor>{last}</Text>
          </Box>
        ) : null}

        {isShortTight && short ? (
          <Text color="warning">
            {t.shortWarn(
              pct(short.percentUsed, lang),
              short.resetsAt ? duration(Date.parse(short.resetsAt) - now, lang) : undefined,
            )}
          </Text>
        ) : null}

        {isOpen ? (
          <Box key="helpbox" flexDirection="column" borderStyle="round" borderDimColor paddingX={2} paddingY={1} marginTop={1}>
            <Text bold>{t.helpTitle}</Text>
            {spaced([
              helpItem(
                period
                  ? t.helpPeriod(billingDay, shortDate(period.start, lang, 'UTC'), shortDate(period.end, lang, 'UTC'))
                  : t.helpPeriodUnset,
              ),
              helpItem(t.helpWeek),
              helpItem(t.helpFive),
              isSubscription ? helpItem(t.helpHypothetical, 'success') : helpItem(t.helpReal, 'warning'),
              helpItem(t.helpTokens),
              helpItem(t.helpLast),
              helpItem(t.helpPace),
              valueRatio !== null ? helpItem(t.helpPerPercent) : null,
              helpItem(t.helpNotices),
              valueRatio !== null ? helpItem(t.helpValue) : null,
              last ? helpItem(last) : null,
              currency === 'EUR' ? helpItem(t.helpEuro(dec(eurRate, 5, lang))) : null,
            ])}
            <Text>{' '}</Text>
            <Text dimColor>
              {t.helpActive(
                billingDay >= 1 && billingDay <= 31 ? String(billingDay) : off,
                currency,
                planPrice > 0 ? money(planUsd, currency, eurRate, lang) : off,
              )}
            </Text>
          </Box>
        ) : null}
        </Box>
      </Box>
    )
  })
}
