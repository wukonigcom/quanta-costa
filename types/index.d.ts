export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type Snapshot = {
  limits: Limit[]
  usd: number | null
  baseUsd: number
  tokens: number
  baseTokens: number
  othersUsd: number
  // This session's amount booked to the period, and the cost reading it was booked at.
  ownUsd: number
  ownReading: number | null
  now: number
}

declare module 'claude-code' {
  interface PluginState {
    'quanta-costa': { snap: Snapshot; isHelpOpen: boolean }
  }
}
