import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type { Limit, Snapshot } from '../types'

const EMPTY: Snapshot = { limits: [], usd: null, baseUsd: 0, tokens: 0, baseTokens: 0, now: 0 }
const snap = atom({ plugin: 'quanta-costa', key: 'snap' } as const, EMPTY)
const isHelpOpen = atom({ plugin: 'quanta-costa', key: 'isHelpOpen' } as const, false)

const BAR = 12
const LOGO = '🧾' // "Il conto, per favore!"
const DAY = 86_400_000
const NAMES: Record<string, string> = {
  seven_day: 'Week',
  spend_limit: 'Spend',
  five_hour: '5 hours',
}

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

export const money = (usd: number | null, currency: string, eurRate: number): string => {
  if (usd === null) return '?'
  return currency === 'EUR' ? `€${(usd * eurRate).toFixed(2)}` : `$${usd.toFixed(2)}`
}

export const tokenText = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(n)
}

export const duration = (ms: number): string => {
  const minutes = Math.max(0, Math.round(ms / 60_000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const rest = minutes % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${rest}m`
  return `${rest}m`
}

export const weeks = (days: number) => (days / 7).toFixed(1)

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

// "Oct 12": a date-only value (UTC midnight) or an instant shown in local time.
const shortDate = (ms: number, timeZone?: string) => {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric' }).format(new Date(ms))
  } catch {
    return new Date(ms).toISOString().slice(5, 10)
  }
}

const colorFor = (percentUsed: number) =>
  percentUsed >= 90 ? 'error' : percentUsed >= 70 ? 'warning' : 'success'

const refresh = async ($: EngineInterface) => {
  const usage = await $.session.usage()
  const now = await $.clock.now()
  await update($, snap, s => ({
    ...s,
    limits: usage.rateLimits.length > 0 ? usage.rateLimits.map(toLimit) : s.limits,
    usd: usage.cost?.usd ?? s.usd,
    now,
  }))
}

export const register: Register = (on, options) => {
  const billingDay = typeof options.billingDay === 'number' ? Math.round(options.billingDay) : 0
  const currency = options.currency === 'EUR' ? 'EUR' : 'USD'
  const eurRate = typeof options.eurRate === 'number' ? options.eurRate : 0.89238

  on('session.start', async ($, e, next) => {
    await refresh($).catch(() => undefined)
    // Loaded mid-session: "last prompt" starts at zero, not at the whole session.
    await update($, snap, s => (s.baseUsd === 0 ? { ...s, baseUsd: s.usd ?? 0 } : s))
    $.clock.every(60_000, () => {
      void $.clock.now().then(now => update($, snap, s => ({ ...s, now })))
    })
    return next(e)
  })

  // A new prompt starts a new "last prompt" count.
  on('prompt.submit', async ($, e, next) => {
    const usage = await $.session.usage()
    await update($, snap, s => ({
      ...s,
      usd: usage.cost?.usd ?? s.usd,
      baseUsd: usage.cost?.usd ?? s.usd ?? 0,
      baseTokens: s.tokens,
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
      await update($, snap, s => ({ ...s, tokens: s.tokens + sum }))
    }
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, snap, s => ({
      ...s,
      limits: e.rateLimits.length > 0 ? e.rateLimits.map(toLimit) : s.limits,
      usd: e.cost?.usd ?? s.usd,
      now,
    }))
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') await update($, snap, () => EMPTY)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const s = await read($, snap)
    const isOpen = await read($, isHelpOpen)
    const now = s.now || (await $.clock.now())

    const week = pickPeriod(s.limits)
    const short = s.limits.find(l => l.kind === 'five_hour')
    const isShortTight = short !== undefined && short !== week && short.percentUsed >= 80
    const isSubscription = s.limits.length > 0

    const lastUsd = s.usd === null ? null : Math.max(0, s.usd - s.baseUsd)
    const lastTokens = Math.max(0, s.tokens - s.baseTokens)
    const period = billingDay >= 1 && billingDay <= 31 ? billingPeriod(now, billingDay) : null

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
            {label('Period')}
            <Text color="suggestion">{bar(period.percentGone)}</Text>
            <Text>
              {`${weeks(period.daysGone)} of ${weeks(period.daysTotal)} weeks gone · ${weeks(period.daysLeft)} wk left · renews in ${period.daysLeft} ${period.daysLeft === 1 ? 'day' : 'days'}`}
            </Text>
          </Box>
        ) : null}

        {week ? (
          <Box key="week" gap={1}>
            {label(NAMES[week.kind] ?? week.kind)}
            <Text color={colorFor(week.percentUsed)}>{bar(week.percentUsed)}</Text>
            <Text>
              {`${Math.round(week.percentUsed)}% used · ${Math.max(0, 100 - Math.round(week.percentUsed))}% free` +
                (week.resetsAt ? ` (resets ${shortDate(Date.parse(week.resetsAt))})` : '')}
            </Text>
          </Box>
        ) : (
          <Text dimColor>Week: no reading yet, it appears with the next reply.</Text>
        )}

        <Box key="session" gap={1}>
          {label('Session')}
          <Text>{`${tokenText(s.tokens)} tokens · ${money(s.usd, currency, eurRate)}`}</Text>
          <Text dimColor>{`· last prompt ${money(lastUsd, currency, eurRate)} · ${tokenText(lastTokens)} tokens`}</Text>
          <Button
            key="help"
            hotkey="h"
            label={isOpen ? 'Close help' : 'Help'}
            onPress={() => update($, isHelpOpen, open => !open)}
          />
        </Box>

        {isShortTight && short ? (
          <Text color="warning">
            {`5-hour limit ${Math.round(short.percentUsed)}% used` +
              (short.resetsAt ? ` · resets in ${duration(Date.parse(short.resetsAt) - now)}` : '')}
          </Text>
        ) : null}

        {isOpen ? (
          <Box flexDirection="column">
            <Text bold>Quanta Costa: what the numbers mean</Text>
            <Text>
              {period
                ? `Period: your Claude subscription renews on day ${billingDay} of each month, this period runs ${shortDate(period.start, 'UTC')} to ${shortDate(period.end, 'UTC')}. The top bar shows how many weeks of this paid month are gone and how many are left. Every new week brings a fresh weekly allowance.`
                : 'Period: set your billing day in the settings (billingDay, it is on your Anthropic receipt). A bar on top then shows how much of your paid month is gone.'}
            </Text>
            <Text>
              Week: your plan has a weekly allowance. The bar shows how much of it is used. When it is full, you wait for the reset.
            </Text>
            <Text>
              5-hour limit: there is also a short 5-hour window. It only shows up here, as a warning, once it passes 80%.
            </Text>
            {isSubscription ? (
              <Text color="success">
                Costs are hypothetical: this is what the session would cost at API list prices. On a subscription you do not pay this on top, it only counts against your weekly allowance. You only really pay for extra usage beyond your limit, if you turned it on.
              </Text>
            ) : (
              <Text color="warning">
                No subscription limits reported: this session probably runs on an API key. Then the costs are real and billed.
              </Text>
            )}
            <Text>
              Tokens: everything the model read and wrote, cache included, counted since Quanta Costa started. The cost always covers the whole session.
            </Text>
            <Text>Last prompt: everything since your last prompt.</Text>
            {currency === 'EUR' ? (
              <Text dimColor>{`Euro: converted at $1 = €${eurRate} (setting eurRate).`}</Text>
            ) : null}
          </Box>
        ) : null}
        </Box>
      </Box>
    )
  })
}
