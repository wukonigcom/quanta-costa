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
  now: number
}

declare module 'claude-code' {
  interface PluginState {
    'quanta-costa': { snap: Snapshot; isHelpOpen: boolean }
  }
}
