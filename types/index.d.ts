export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type Snapshot = {
  limits: Limit[]
  usd: number | null
  baseUsd: number
  tokens: number
  baseTokens: number
  // What the period's other runs (and amounts from before 1.6.1) add up to.
  othersUsd: number
  // This run's first and highest reading in the period: its cost is the difference.
  ownFirst: number | null
  ownTop: number
  // When counting began in this period, if known.
  since: number | null
  // The value added this week and the weekly percentage points used since Quanta Costa first saw the week.
  weekUsd: number | null
  weekPoints: number
  // The period before this one: its key, its value and since when it was counted.
  prevPeriod: string | null
  prevUsd: number | null
  prevSince: number | null
  now: number
}

// The plans the setup steps offer.
export type PlanId = 'pro' | 'max' | 'ultra' | 'team' | 'api'

// The setup steps in the band, one question each.
export type SetupStep = 'language' | 'plan' | 'currency' | 'price' | 'day' | 'review'

// What the person has picked so far.
export type SetupDraft = {
  language?: 'en' | 'de'
  plan?: PlanId
  currency?: 'USD' | 'EUR'
  planPrice?: number
  billingDay?: number
}

// The step shown ('idle': not asked yet this session, 'closed': done or put off), the picks, a typing error.
export type Setup = { step: SetupStep | 'idle' | 'closed'; draft: SetupDraft; error: string | null }

declare module 'claude-code' {
  interface PluginState {
    'quanta-costa': { snap: Snapshot; isHelpOpen: boolean; setup: Setup }
  }
}
