export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type Snapshot = {
  limits: Limit[]
  usd: number | null
  baseUsd: number
  tokens: number
  baseTokens: number
  now: number
}

declare module 'claude-code' {
  interface PluginState {
    'quanta-costa': { snap: Snapshot; isHelpOpen: boolean }
  }
}
