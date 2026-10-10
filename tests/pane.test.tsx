import { expect, mock, test } from 'claude-code/testing'

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
