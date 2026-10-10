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
  now: num(s?.now),
})

const snap = atom({ plugin: 'quanta-costa', key: 'snap' } as const, EMPTY)
const isHelpOpen = atom({ plugin: 'quanta-costa', key: 'isHelpOpen' } as const, false)

const BAR = 12
const LOGO = '🧾' // "Il conto, per favore!"
const DAY = 86_400_000
export const VERSION = '1.3.2'
const PLUGIN = 'quanta-costa'
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

// Books this session's cost to its period in the store kept across sessions, and returns
// what the period's other sessions cost.
const book = async ($: EngineInterface, usd: number, key: string) => {
  const id = await $.session.id()
  const ledger = ((await $.store.get(LEDGER)) ?? {}) as Ledger
  const period = { ...(ledger[key] ?? {}) }
  period[id] = Math.max(num(period[id]), usd)
  const kept = Object.keys({ ...ledger, [key]: period })
    .sort()
    .slice(-KEEP_PERIODS)
  const next: Ledger = {}
  for (const k of kept) next[k] = k === key ? period : (ledger[k] ?? {})
  await $.store.set(LEDGER, next)
  return Object.entries(period).reduce((sum, [sid, v]) => (sid === id ? sum : sum + num(v)), 0)
}

// With a plan price set: book this session's cost and learn what the period's others cost.
const bookPeriod = async ($: EngineInterface, planPrice: number, billingDay: number) => {
  if (planPrice <= 0) return
  const { usd } = normalize(await read($, snap))
  const now = await $.clock.now()
  const othersUsd = await book($, usd ?? 0, periodKey(now, billingDay))
  await update($, snap, s => ({ ...normalize(s), othersUsd }))
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
  noReading: string
  sessionMain: (tokens: string, cost: string) => string
  sessionLast: (cost: string, tokens: string) => string
  help: string
  closeHelp: string
  valueLine: (value: string, plan: string) => string
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
  helpValue: string
  helpEuro: (rate: string) => string
  helpNotices: string
  helpActive: (billingDay: string, currency: string, plan: string) => string
  warnWeek: (percent: string, resets: string, runsOut?: string) => string
  freshWeek: (free: string) => string
  review: (start: string, end: string, value: string, ratio?: string) => string
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
    noReading: 'Week: no reading yet, it appears with the next reply.',
    sessionMain: (tokens, cost) => `${tokens} tokens · ${cost}`,
    sessionLast: (cost, tokens) => `· last prompt ${cost} · ${tokens} tokens`,
    help: 'Help',
    closeHelp: 'Close help',
    valueLine: (value, plan) => `${value} API value vs ${plan} plan`,
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
      'Tokens: everything the model read and wrote, cache included, counted since Quanta Costa started. The cost always covers the whole session.',
    helpLast: 'Last prompt: everything since your last prompt.',
    helpPace:
      'Pace: Quanta Costa extrapolates your usage so far this week. "on track" means it lasts until the reset, otherwise it shows when it would run out.',
    helpValue:
      'Value: the API value of all sessions in this period (those where Quanta Costa ran) against your plan price. Above 1× your plan has paid for itself.',
    helpEuro: rate => `Euro: converted at $1 = €${rate} (setting eurRate).`,
    helpNotices:
      'Notices: Quanta Costa tells you once when the week passes 80% and 90%, when a fresh week starts, and at the end of each period how much it was worth.',
    helpActive: (billingDay, currency, plan) =>
      `Active settings: language en · billing day ${billingDay} · ${currency} · plan ${plan} · version ${VERSION}`,
    warnWeek: (percent, resets, runsOut) =>
      `Quanta Costa: ${percent} of your weekly limit used, it resets ${resets}.` +
      (runsOut ? ` At this pace it runs out ${runsOut}.` : ''),
    freshWeek: free => `Quanta Costa: fresh week, your weekly limit has reset (${free} free).`,
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
    noReading: 'Woche: noch keine Messung, kommt mit der nächsten Antwort.',
    sessionMain: (tokens, cost) => `${tokens} Tokens · ${cost}`,
    sessionLast: (cost, tokens) => `· zuletzt ${cost} · ${tokens} Tokens`,
    help: 'Hilfe',
    closeHelp: 'Hilfe zu',
    valueLine: (value, plan) => `${value} API-Wert vs. ${plan} Abo`,
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
      'Tokens: alles, was das Modell gelesen und geschrieben hat, inklusive Cache. Gezählt ab dem Start von Quanta Costa. Der Betrag gilt immer für die ganze Sitzung.',
    helpLast: 'Zuletzt: alles seit deinem letzten Prompt.',
    helpPace:
      'Tempo: Quanta Costa rechnet deinen bisherigen Wochenverbrauch hoch. „im Plan" heißt, es reicht bis zum Reset. Sonst steht da, wann das Kontingent leer wäre.',
    helpValue:
      'Wert: der API-Wert aller Sitzungen dieser Periode (in denen Quanta Costa lief) im Vergleich zu deinem Abo-Preis. Über 1× hat sich dein Abo bezahlt gemacht.',
    helpEuro: rate => `Euro: umgerechnet mit 1 $ = ${rate} € (Einstellung eurRate).`,
    helpNotices:
      'Hinweise: Quanta Costa meldet sich je einmal, wenn die Woche 80 % und 90 % erreicht, wenn eine neue Woche startet und am Ende jeder Periode mit ihrem Wert.',
    helpActive: (billingDay, currency, plan) =>
      `Aktive Einstellungen: Sprache de · Abrechnungstag ${billingDay} · ${currency} · Abo ${plan} · Version ${VERSION}`,
    warnWeek: (percent, resets, runsOut) =>
      `Quanta Costa: ${percent} deines Wochenlimits verbraucht, neu ab ${resets}.` +
      (runsOut ? ` Bei diesem Tempo leer ab ${runsOut}.` : ''),
    freshWeek: free => `Quanta Costa: neue Woche, dein Wochenlimit ist zurückgesetzt (${free} frei).`,
    review: (start, end, value, ratio) =>
      `Quanta Costa: letzte Periode ${start} bis ${end}: ${value} API-Wert` + (ratio ? `, ${ratio}× dein Abo.` : '.'),
  },
}

type Notices = { week?: number; level?: number; seenPeriod?: string }
type NoticeOptions = { lang: Lang; planPrice: number; billingDay: number; currency: string; eurRate: number }
const NOTICES = 'notices'

// Two readings belong to the same week when their reset times lie within a day of each other.
export const isSameWeek = (a: number, b: number) => Math.abs(a - b) < DAY

// Shows each notice once (remembered across sessions): 80% and 90% of the week, a fresh week,
// and a look back at the period that just ended.
const notify = async ($: EngineInterface, o: NoticeOptions) => {
  const t = TEXTS[o.lang]
  const s = normalize(await read($, snap))
  const now = s.now || (await $.clock.now())
  const stored = ((await $.store.get(NOTICES)) ?? {}) as Notices
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
          shortDate(resetsAt, o.lang),
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
      const ledger = ((await $.store.get(LEDGER)) ?? {}) as Ledger
      const ended = ledger[seen]
      if (ended) {
        const usd = Object.values(ended).reduce((sum, v) => sum + num(v), 0)
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

  if (JSON.stringify(next) !== JSON.stringify(stored)) await $.store.set(NOTICES, next)
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

type Settings = { billingDay: number; currency: 'USD' | 'EUR'; eurRate: number; planPrice: number; lang: Lang }

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
})

export const isAllDefault = (c: Settings) =>
  c.billingDay === 0 && c.currency === 'USD' && c.planPrice === 0 && c.lang === 'en' && c.eurRate === DEFAULT_EUR_RATE

// Claude Code hands a plugin the options stored under the name it loaded the plugin by. The desktop
// app loads a plugin installed from a local folder as "quanta-costa@inline", while `claude plugin
// configure` stores the options as "quanta-costa@<marketplace>", so only defaults arrive. In that case
// look up this plugin's own entry in the settings file, under any of its names. Nothing else is read.
export const findSavedOptions = async ($: EngineInterface): Promise<Record<string, unknown> | null> => {
  const configDir = await $.env.get('CLAUDE_CONFIG_DIR')
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  const dir = configDir ?? (home ? `${home}/.claude` : undefined)
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
    const usage = await $.session.usage()
    await update($, snap, s => ({
      ...normalize(s),
      usd: usage.cost?.usd ?? normalize(s).usd,
      baseUsd: usage.cost?.usd ?? normalize(s).usd ?? 0,
      baseTokens: normalize(s).tokens,
    }))
    return next(e)
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

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const { billingDay, currency, eurRate, planPrice, lang } = cfg
    const t = TEXTS[lang]
    const s = normalize(await read($, snap))
    const isOpen = await read($, isHelpOpen)
    const now = s.now || (await $.clock.now())

    const week = pickPeriod(s.limits)
    const short = s.limits.find(l => l.kind === 'five_hour')
    const isShortTight = short !== undefined && short !== week && short.percentUsed >= 80
    const isSubscription = s.limits.length > 0

    const lastUsd = s.usd === null ? null : Math.max(0, s.usd - s.baseUsd)
    const lastTokens = Math.max(0, s.tokens - s.baseTokens)
    const period = billingDay >= 1 && billingDay <= 31 ? billingPeriod(now, billingDay) : null
    const forecast = week ? pace(week, now) : null
    const periodUsd = s.othersUsd + (s.usd ?? 0)
    const planUsd = currency === 'EUR' ? planPrice / eurRate : planPrice
    const valueRatio = planPrice > 0 ? periodUsd / planUsd : null

    const off = lang === 'de' ? 'aus' : 'off'

    // "Title: body" becomes a bold title over its own paragraph.
    const helpItem = (text: string, color?: 'success' | 'warning') => {
      const cut = text.indexOf(': ')
      const title = cut > 0 ? text.slice(0, cut) : ''
      const body = cut > 0 ? text.slice(cut + 2) : text
      return (
        <Box flexDirection="column">
          {title ? (
            color ? (
              <Text bold color={color}>
                {title}
              </Text>
            ) : (
              <Text bold>{title}</Text>
            )
          ) : null}
          <Text>{body}</Text>
        </Box>
      )
    }

    // A blank line before each topic, so the help stays easy to read.
    const spaced = (items: (ReturnType<typeof helpItem> | null)[]) =>
      items.flatMap(item => (item === null ? [] : [<Text> </Text>, item]))

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
            {week.resetsAt ? <Text>{t.resets(shortDate(Date.parse(week.resetsAt), lang))}</Text> : null}
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
            <Text>{t.valueLine(money(periodUsd, currency, eurRate, lang), money(planUsd, currency, eurRate, lang))}</Text>
            {valueRatio >= 1 ? (
              <Text color="success" bold>{`(${dec(valueRatio, 1, lang)}×)`}</Text>
            ) : (
              <Text>{`(${dec(valueRatio, 1, lang)}×)`}</Text>
            )}
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
              helpItem(t.helpNotices),
              valueRatio !== null ? helpItem(t.helpValue) : null,
              currency === 'EUR' ? helpItem(t.helpEuro(dec(eurRate, 5, lang))) : null,
            ])}
            <Text> </Text>
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
