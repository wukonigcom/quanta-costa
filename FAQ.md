# 🧾 Quanta Costa FAQ

Questions and answers about every feature of [Quanta Costa](README.md), the Claude Code plugin that shows your usage limits, pace forecast, session cost and plan value right above the prompt. Each answer comes with an example of what you see.

All examples below use the same moment: **Saturday, October 10, 12:00**, a plan that renews on the **29th**, and a week that resets on **Monday, October 12, 12:00**.

**Contents**

- [The band at a glance](#the-band-at-a-glance)
- [Period](#period)
- [Week and pace](#week-and-pace)
- [5-hour limit](#5-hour-limit)
- [Session and last prompt](#session-and-last-prompt)
- [Value](#value)
- [Notices](#notices)
- [Help, pane and phone](#help-pane-and-phone)
- [Language and currency](#language-and-currency)
- [Settings](#settings)
- [Privacy](#privacy)
- [Troubleshooting](#troubleshooting)
- [Install, update, uninstall](#install-update-uninstall)

---

## The band at a glance

### What does each row mean?

```
🧾 Period   ████░░░░░░░░  1.6 of 4.3 weeks gone · 2.7 wk left · renews in 19 days
   Week     █████░░░░░░░  42% used · 58% free · on track (resets Oct 12)
   Session  3.3M tokens · $4.95 · last prompt $0.07 · 85k tokens   [Help]
   Value    ████████████  $412.30 API value vs $200.00 plan (2.1×)
```

| Row | Question it answers |
| --- | --- |
| **Period** | How much of the month I paid for is gone? |
| **Week** | How much of my weekly allowance is left, and will it last? |
| **Session** | What is this session costing at API prices, and what did my last prompt cost? |
| **Value** | Is my subscription paying off this period? |

Period and Value only appear once you set `billingDay` and `planPrice`. Without settings you see Week and Session.

### Are the costs real? Do I pay them?

On a **Claude subscription (Pro or Max): no.** The amounts are what the same work would cost at API list prices, the figure `/cost` shows. You do not pay them on top of your plan; they only count against your weekly allowance. Real money is only charged for extra usage beyond your limit, and only if you turned that on.

On an **API key: yes.** Claude Code then reports no subscription limits, and the help says so in its own line:

> **No subscription limits reported:** this session probably runs on an API key. Then the costs are real and billed.

---

## Period

### What does the Period row show?

How many weeks of your paid month are gone and how many are left, plus the days until it renews.

**Example:** `billingDay` is 29, today is October 10. The period runs September 29 to October 29, that is 30 days or 4.3 weeks. 11 days are gone, 19 are left:

```
Period   ████░░░░░░░░  1.6 of 4.3 weeks gone · 2.7 wk left · renews in 19 days
```

### Where do I find my billing day?

On your Anthropic receipt, or in the billing section of your Claude account settings. It is the day of the month your subscription renews. Claude Code itself does not know it, which is why you set it once.

### My plan renews on the 31st. What happens in shorter months?

A day the month lacks falls on its last day. With `billingDay` 31 the periods run October 31 to November 30, then November 30 to December 31.

### Why does Period count in weeks?

Because your allowance renews weekly. A month has about 4.3 weeks, and "2.7 weeks left" tells you how many fresh weekly allowances your current payment still covers.

---

## Week and pace

### What does the Week row show?

How much of your weekly allowance is used and free, a pace forecast, and when the week resets.

```
Week     █████░░░░░░░  42% used · 58% free · on track (resets Oct 12)
```

The bar is green below 70%, yellow from 70% and red from 90%.

### Does the Week bar only count this session?

No. The reading comes from Anthropic with each reply and covers your whole plan: all sessions, all windows, all devices.

### How does the pace forecast work?

Quanta Costa takes your usage so far this week and extrapolates it: if you keep going at the same rate, when would you hit 100%?

**Example 1, on track:** the week started Monday October 5 at 12:00. Now it is Saturday 12:00, 5 days in, and 42% is used. At that rate 100% would come after 11.9 days, long after the reset on day 7:

```
Week     █████░░░░░░░  42% used · 58% free · on track (resets Oct 12)
```

**Example 2, running out:** same week, but it is Wednesday October 7 at 12:00, 2 days in, and 60% is already used. At that rate 100% comes after 3.3 days, on Thursday at 20:00:

```
Week     ███████░░░░░  60% used · 40% free · runs out Thu 20:00 (resets Oct 12)
```

The forecast stays hidden during the first 3 hours of a week and below 2% usage, so it never guesses from too little data.

### What if my plan has no weekly limit?

The row shows the next limit Claude Code reports: a spend limit (label **Spend**) or the 5-hour window (label **5 hours**). Without any limit you see a dim line: `Week: no reading yet, it appears with the next reply.`

---

## 5-hour limit

### Why don't I see the 5-hour limit?

On purpose. Claude plans also meter a short 5-hour window. Quanta Costa only shows it when it gets tight, at 80% or more, because then it is the limit that stops you:

```
5-hour limit 85% used · resets in 1h 20m
```

Below 80% the line disappears again.

---

## Session and last prompt

### What does the Session row show?

The tokens and the API-price cost of the current session, and the same for everything since your last prompt.

```
Session  3.3M tokens · $4.95 · last prompt $0.07 · 85k tokens   [Help]
```

The numbers update after every tool call, so you can watch a long task add up.

### Why are the token numbers so high?

They include cache reads. Each turn, the model reads the whole conversation again, mostly from the cache. A conversation of 100k tokens read 30 times is already 3M tokens. Cache reads cost a tenth of normal input, so the cost stays far lower than the token count suggests.

### Why do the tokens start at zero when I reload mid-session?

Tokens are summed from the moment Quanta Costa loads. The cost always covers the whole session, because Claude Code reports it as a total. Subagents are counted in both.

### What exactly is "last prompt"?

Everything since you last pressed Enter: the model's replies, its tool calls and any subagents it started. It resets with each new prompt.

---

## Value

### What does the Value row show?

The API value of **all your sessions in the current billing period** against your plan price.

```
Value    ████████████  $412.30 API value vs $200.00 plan (2.1×)
```

`2.1×` means you used work worth 2.1 times your subscription. From 1× on, the ratio turns green: your plan has paid for itself. Below 1× the bar shows how far you are:

```
Value    █████████░░░  $150.00 API value vs $200.00 plan (0.8×)
```

### Is Value only this chat, or all my sessions?

All sessions of the period, in the terminal and in the desktop app, every window. Each session books its cost to a small shared ledger file on your machine, and every window adds them up. When you work in several windows, each one shows the same total after its next reply.

### Which sessions are not counted?

- Sessions before you installed Quanta Costa or set `planPrice`.
- Sessions on another computer (the ledger is local).
- Chats on claude.ai, which share your limits but are not Claude Code sessions.

So the real value of your plan is usually higher than shown.

### How is the ratio calculated with euros?

Your plan price is converted to dollars with `eurRate`, then compared. **Example:** `planPrice` 180, `currency` EUR, `eurRate` 0.89238. The period's sessions are worth $300.00:

```
Value    ████████████  €267.71 API value vs €180.00 plan (1.5×)
```

$300.00 × 0.89238 = €267.71, and €267.71 ÷ €180.00 = 1.5.

### How far back does the ledger go?

It keeps the current and the two previous periods. Older periods drop out automatically, so the file stays tiny.

---

## Notices

### What notices are there?

Four, each shown once as a short message for 12 seconds:

| When | Example |
| --- | --- |
| The week passes 80% | `Quanta Costa: 82% of your weekly limit used, it resets Oct 12. At this pace it runs out Sun 18:00.` |
| The week passes 90% | `Quanta Costa: 91% of your weekly limit used, it resets Oct 12.` |
| A fresh week starts | `Quanta Costa: fresh week, your weekly limit has reset (100% free).` |
| A billing period ends | `Quanta Costa: last period Sep 29 to Oct 29: $412.30 API value, 2.1× your plan.` |

The pace sentence is only added when you are not on track. The period review needs `planPrice`.

### I have three windows open. Do I get every notice three times?

No. Shown notices are remembered in the shared file, so each one appears once, in whichever window sees it first.

---

## Help, pane and phone

### How do I open the help?

Press **h** or click **Help** at the end of the Session row. It explains every number in one line per topic, says whether your costs are real, and ends with the active settings:

```
Active settings: language en · billing day 29 · EUR · plan €180.00 · version 1.5.0
```

That last line is the quickest way to check which version runs and whether your settings arrived.

### Can I see Quanta Costa on my phone?

Yes. Type `/quanta-costa`. It opens the same view in a pane, and panes show on every surface, including the Claude mobile app when you follow a session there. The band above the prompt itself only exists in the terminal and the desktop app.

### Does it fit my theme, dark mode or skin?

Yes. It uses the theme's own colors for success, warning and error, so it follows light and dark mode and any skin.

---

## Language and currency

### How do I switch to German?

Set `language` to `de`. Labels, help, notices, numbers and dates switch together:

```
🧾 Periode  ████░░░░░░░░  1,6 v. 4,3 Wochen vorbei · 2,7 W offen · noch 19 Tage
   Woche    █████░░░░░░░  42 % verbraucht · 58 % frei · im Plan (neu ab 12.10.)
   Sitzung  3,3 Mio Tokens · 4,42 € · zuletzt 0,06 € · 85 Tsd. Tokens   [Hilfe]
   Wert     ████████████  267,71 € API-Wert vs. 180,00 € Abo (1,5×)
```

### How do I show euros?

Set `currency` to `EUR`. Amounts are converted from dollars with `eurRate` (default 0.89238, the ECB rate of October 9, 2026). **Example:** $4.95 × 0.89238 = €4.42.

### How do I update the exchange rate?

Set `eurRate` to the current euros per US dollar, for example `0.92`. The help shows the rate in use: `Euro: converted at $1 = €0.89238 (setting eurRate).`

---

## Settings

### Which settings are there?

| Setting | Example | Effect |
| --- | --- | --- |
| `language` | `de` | German labels, help and number formats |
| `billingDay` | `29` | Turns on the Period row and the period review |
| `currency` | `EUR` | Amounts in euros |
| `eurRate` | `0.92` | Euros per US dollar |
| `planPrice` | `180` | Your monthly price in your currency; turns on the Value row |

`0` for `billingDay` or `planPrice` hides the row again.

### How do I change them?

In Claude Code:

```
/plugin configure quanta-costa
```

Or in a shell:

```bash
claude plugin configure quanta-costa
```

They are saved in `~/.claude/settings.json`:

```json
"pluginConfigs": {
  "quanta-costa@quanta-costa": {
    "options": { "language": "en", "billingDay": 29, "currency": "EUR", "planPrice": 180 }
  }
}
```

### I changed a setting, but the band still shows the old one.

Type `/reload-plugins` or start a new session. Then open the help and check the last line.

---

## Privacy

### Does Quanta Costa send my data anywhere?

No. It makes no network calls. All numbers come from Claude Code itself through the plugin API.

### What does it write and read on my disk?

- **Writes** one small file, `~/.claude/quanta-costa/ledger.json`: the cost per session id for the last three periods, and which notices were shown. No prompts, no code, no file names.
- **Reads** that file, and its own entry in `~/.claude/settings.json` when Claude Code hands over no settings. Nothing else.

---

## Troubleshooting

### I only see two rows and dollars instead of euros.

Your settings did not arrive. The Claude desktop app loads a plugin installed from a local folder under the name `quanta-costa@inline`, while `claude plugin configure` stores the options under `quanta-costa@<marketplace>`. Since 1.3.2 Quanta Costa looks up its own entry in `~/.claude/settings.json` under any of its names. Update to the latest version, then check the last line of the help.

### Different windows showed different Value amounts.

Fixed in 1.5.0. Before, each way Claude Code loaded the plugin kept its own ledger. Now all sessions share one file and older ledgers are merged in, so nothing is lost. Update, then `/reload-plugins` in every open window.

### The band shows `NaN`.

Fixed in 1.1.1. An older saved state lacked a field after an update mid-session. Update to the latest version.

### I updated, but the old version still runs.

Claude Code runs plugins from a cached copy. Update the marketplace and the plugin, then reload:

```bash
claude plugin marketplace update quanta-costa
```

```bash
claude plugin update quanta-costa@quanta-costa
```

Then type `/reload-plugins` in Claude Code, or restart it. The help shows the version that runs.

### The band disappeared for a moment.

When Claude Code shows its own feedback survey above the prompt, Quanta Costa steps aside and comes back afterwards.

---

## Install, update, uninstall

### How do I install it?

Type this at the prompt of a Claude Code session:

```
/plugin install quanta-costa --marketplace wukonigcom/quanta-costa
```

Answer `y` to add the marketplace, pick the **user** scope, then set the options. A plugin in the user scope also runs in the Claude desktop app (Code tab).

### What do I need?

Claude Code 2.1.293 or newer. Quanta Costa uses Claude Code's function-hooks plugin API, which is in early access and may change between releases.

### How do I remove it?

```bash
claude plugin uninstall quanta-costa@quanta-costa
```

Then delete the folder `~/.claude/quanta-costa/` if you want the ledger gone as well.

### How is it different from ccusage?

[ccusage](https://github.com/ryoppippi/ccusage) analyses Claude Code's log files after the fact, from the command line. Quanta Costa lives inside Claude Code and shows the live numbers while you work, including your weekly limit and the pace forecast.

---

Another question? [Open an issue](https://github.com/wukonigcom/quanta-costa/issues).
