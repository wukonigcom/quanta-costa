import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const PANE_PROPS = {
  title: 'Quanta Costa',
  isFocused: false,
  bodyColumns: 44,
  placement: 'inline',
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
} as const

test(
  'The same view in a pane, drawn on desktop, terminal and mobile (iPhone app)',
  { options: { billingDay: 29, currency: 'EUR', planPrice: 5 } },
  async ($, on) => {
    mock.clock(on, { now: Date.parse('2026-10-09T12:00:00Z') })
    mock.store(on)
    on('session.id', () => ({ value: 'this-session' }))
    on('session.measure', ($, e) => ({ changed: e.changed }))
    await $.session.measure({
      context: { window: 200_000 },
      rateLimits: [{ kind: 'seven_day', percentUsed: 42, resetsAt: '2026-10-12T12:00:00Z' }],
      cost: { usd: 10 },
      changed: ['rateLimits', 'cost'],
    })

    for (const surface of ['mobile', 'desktop', 'terminal'] as const) {
      const ui = await $.ui.mount({
        plugin: 'quanta-costa',
        surface,
        component: 'Pane',
        props: PANE_PROPS,
        requestId: 'quanta-costa',
      })
      const rows = (await ui.findAll({ type: 'Box' })).filter(r => r.key !== undefined)
      expect(rows.map(r => r.key)).toEqual(['logo', 'period', 'week', 'session', 'value'])
      expect(await ui.find({ text: /€8\.92/ })).toBeDefined()
      await ui.press({ key: 'help' })
      expect(await ui.find({ key: 'helpbox' })).toBeDefined()
      await ui.press({ key: 'help' })
      await ui.unmount()
    }
  },
)

test('Another plugin\'s pane is left alone', async ($, on) => {
  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>other plugin</Text>
  })
  const ui = await $.ui.mount({
    plugin: 'quanta-costa',
    surface: 'desktop',
    component: 'Pane',
    props: PANE_PROPS,
    requestId: 'someone-else',
  })
  expect(await ui.find({ key: 'logo' })).toBeUndefined()
  expect(await ui.find({ text: /^other plugin$/ })).toBeDefined()
  await ui.unmount()
})

test(
  '"/quanta-costa" sent as text (the iPhone app): Claude gets the numbers and answers with them',
  { options: { billingDay: 29, currency: 'EUR', planPrice: 180 } },
  async ($, on) => {
    mock.clock(on, { now: Date.parse('2026-10-10T10:00:00Z') })
    mock.store(on)
    on('session.id', () => ({ value: 'this-session' }))
    on('session.measure', ($, e) => ({ changed: e.changed }))
    on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [], cost: { usd: 4.95 } } }))
    on('prompt.submit', ($, e) => ({ text: e.text, context: e.context }))
    // A new session: Claude Code's counter starts at zero.
    await $.session.measure({ context: { window: 200_000 }, rateLimits: [], cost: { usd: 0 }, changed: ['cost'] })
    await $.session.measure({
      context: { window: 200_000 },
      rateLimits: [{ kind: 'seven_day', percentUsed: 42, resetsAt: '2026-10-12T10:00:00Z' }],
      cost: { usd: 4.95 },
      changed: ['rateLimits', 'cost'],
    })

    const asked = await $.prompt.submit({ text: ' /quanta-costa ', wait: false, origin: { kind: 'bridge' } })
    expect('text' in asked ? asked.text : asked).toBe(' /quanta-costa ')
    const context = 'context' in asked ? (asked.context ?? []) : []
    expect(context).toHaveLength(1)
    expect(context[0]).toMatch(/^The person typed \/quanta-costa, most likely on their phone/)
    expect(context[0]).toMatch(
      /\n🧾 Quanta Costa \| Period: 1\.6 of 4\.3 weeks gone · 2\.7 wk left · renews in 19 days \| Week: 42% used · 58% free · on track \(resets Oct 12\) \| Session: 0 tokens · €4\.42 · last prompt €4\.42 · 0 tokens \| Value: €4\.42 API value since Oct 10 vs €180\.00 plan \(0\.0×\)$/,
    )

    // Any other prompt goes on untouched.
    const other = await $.prompt.submit({ text: 'what does /quanta-costa show?', wait: false, origin: { kind: 'bridge' } })
    expect(other).toEqual({ text: 'what does /quanta-costa show?' })
  },
)

test('/quanta-costa as a command opens the pane and answers with the view as text', async ($, on) => {
  const opened: string[] = []
  on('ui.open', ($, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true as const } }
  })
  mock.clock(on, { now: Date.parse('2026-10-10T10:00:00Z') })
  mock.store(on)
  const { text } = await $.command.run({
    command: 'quanta-costa',
    args: '',
    origin: { kind: 'bridge' },
    presentation: { isFullscreen: false, columns: 44 },
  })
  expect(opened).toEqual(['quanta-costa'])
  expect(text).toMatch(/^🧾 Quanta Costa \| Week: no reading yet.* \| Session: 0 tokens/)
})

const startWorld = (on: On, opened: string[]) => {
  on('ui.open', ($, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true as const } }
  })
  mock.clock(on, { now: Date.parse('2026-10-10T10:00:00Z') })
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 'this-session' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [], cost: { usd: 1 } } }))
}

test('The pane opens beside the chat at every start (openPane, on by default)', { options: { currency: 'EUR' } }, async ($, on) => {
  const opened: string[] = []
  startWorld(on, opened)
  await $.session.start({ cwd: 'C:/work', surface: 'desktop', isInteractive: true })
  expect(opened).toEqual(['quanta-costa'])
})

test('openPane false keeps the pane closed at start', { options: { currency: 'EUR', openPane: false } }, async ($, on) => {
  const opened: string[] = []
  startWorld(on, opened)
  await $.session.start({ cwd: 'C:/work', surface: 'desktop', isInteractive: true })
  expect(opened).toEqual([])
})
