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
   Week     █████░░░░░░░  42% used · 58% free · on track (resets Mon 12:00)
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

How much of your weekly allowance is used and free, a pace forecast, and when the week resets. The reset shows weekday and time, as the Claude app does; a reset more than a week away shows its date.

```
Week     █████░░░░░░░  42% used · 58% free · on track (resets Mon 12:00)
```

The bar is green below 70%, yellow from 70% and red from 90%.

### Does the Week bar only count this session?

No. The reading comes from Anthropic with each reply and covers your whole plan: all sessions, all windows, all devices.

### How does the pace forecast work?

Quanta Costa takes your usage so far this week and extrapolates it: if you keep going at the same rate, when would you hit 100%?

**Example 1, on track:** the week started Monday October 5 at 12:00. Now it is Saturday 12:00, 5 days in, and 42% is used. At that rate 100% would come after 11.9 days, long after the reset on day 7:

```
Week     █████░░░░░░░  42% used · 58% free · on track (resets Mon 12:00)
```

**Example 2, running out:** same week, but it is Wednesday October 7 at 12:00, 2 days in, and 60% is already used. At that rate 100% comes after 3.3 days, on Thursday at 20:00:

```
Week     ███████░░░░░  60% used · 40% free · runs out Thu 20:00 (resets Mon 12:00)
```

The forecast stays hidden during the first 3 hours of a week and below 2% usage, so it never guesses from too little data.

### What does "1% ≈ $25.00 value" mean?

It is how much API value one percent of your weekly limit has bought this week. The first time Quanta Costa sees a new week, it notes the value of all your sessions and how much of the week is used. From then on it divides the value added since by the percentage points used since.

**Example:** the week started Monday October 5 at 12:00. When Quanta Costa first saw it, 2% was used. Now 42% is used, that is 40 points more, and your sessions have added $1,000.00 of API value since. One percent is worth $1,000.00 ÷ 40 = $25.00:

```
Week     █████░░░░░░░  42% used · 58% free · on track (resets Mon 12:00) · 1% ≈ $25.00 value
```

At that rate a whole week of your plan is worth about $2,500. The number appears once 3 more points of the week are used, so a first reading does not make it swing. It needs `planPrice`, like the Value row. Chats on claude.ai and other devices use the weekly limit too, but only sessions where Quanta Costa ran add value, so one percent is worth at least the amount shown.

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

Tokens are summed from the moment Quanta Costa loads. The cost is the total Claude Code reports for the session, the same as `/cost`. Subagents are counted in both.

**Example:** on Monday you work for $30 in a session. On Tuesday you resume it and work for another $20. Claude Code usually carries the $30 over, so the Session row shows $50. After a hard stop (a crash, or the app killed) it can start from zero again, and the Session row shows $20. The Value row counts $50 either way, see [Does Value count a session I resume later?](#does-value-count-a-session-i-resume-later).

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

### Since when does Value count?

From the moment Quanta Costa first booked a cost in the period. When that was after the period began, for example on the day you installed it, the row says so:

```
Value    ████████████  $412.30 API value since Oct 9 vs $200.00 plan (2.1×)
```

Only work done from then on counts. A session you resume brings the cost Claude Code counted for it before, and that part is left out. In a full period the row shows no date: it counts from the first day. For a period that began before 1.6.1 the start was not recorded, so no date appears until the next period.

### Does Value count a session I resume later?

Yes, every run, and none twice. Claude Code either carries a resumed session's cost over or, after a hard stop, starts from zero again. Since 1.6.1 Quanta Costa counts each run from its own first reading, so both cases add up the same.

**Example:** Monday $30, Tuesday you resume the session and work for $20. Whether the Session row shows $50 (carried over) or $20 (from zero), the Value row adds $30 + $20 = $50.

A session that runs across your billing day counts toward each period with the work done in it.

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

### Where do I see the last period?

When a new period starts, a notice tells you once what the period that just ended was worth. After that the same figure stays in two places: as the last topic of the help (press `h`) and as a line in the pane that `/quanta-costa` opens. On the phone it comes at the end of Claude's answer to `/quanta-costa`.

**Example:** your plan renews on the 29th, it is October 30, and the period from September 29 to October 29 was worth $300.00 against a $200.00 plan:

```
Last period Sep 29 to Oct 29: $300.00 API value (1.5×)
```

If Quanta Costa only started counting during that period, the line says since when, for example `$300.00 API value since Oct 9`. The band above the prompt stays as it is.

### How far back does the ledger go?

It keeps the current and the two previous periods. Older periods drop out automatically, so the files stay tiny.

---

## Notices

### What notices are there?

Four, each shown once as a short message for 12 seconds:

| When | Example |
| --- | --- |
| The week passes 80% | `Quanta Costa: 82% of your weekly limit used, it resets Mon 12:00. At this pace it runs out Sun 18:00.` |
| The week passes 90% | `Quanta Costa: 91% of your weekly limit used, it resets Mon 12:00.` |
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
Active settings: language en · billing day 29 · EUR · plan €180.00 · version 1.7.1
```

That last line is the quickest way to check which version runs and whether your settings arrived.

### Can I see Quanta Costa on my phone?

Yes, as one line of text. The Claude mobile app shows no band and no pane, and it sends `/quanta-costa` as a plain message. Quanta Costa adds the numbers to that message, and Claude answers with them.

**Example:** on your phone, open the Claude app, go to **Code**, pick the session running on your computer and send `/quanta-costa`. Claude answers:

```
🧾 Quanta Costa | Period: 1.6 of 4.3 weeks gone · 2.7 wk left · renews in 19 days | Week: 42% used · 58% free · on track (resets Mon 12:00) | Session: 3.3M tokens · $4.95 · last prompt $0.07 · 85k tokens | Value: $412.30 API value vs $200.00 plan (2.1×)
```

That answer is a short normal reply, so it counts toward your usage like any other. Your computer has to be on, since the session runs there. In the terminal and the desktop app, `/quanta-costa` opens the view in a pane and prints the same line, without asking Claude.

### Does it fit my theme, dark mode or skin?

Yes. It uses the theme's own colors for success, warning and error, so it follows light and dark mode and any skin.

---

## Language and currency

### How do I switch to German?

Set `language` to `de`. Labels, help, notices, numbers and dates switch together:

```
🧾 Periode  ████░░░░░░░░  1,6 v. 4,3 Wochen vorbei · 2,7 W offen · noch 19 Tage
   Woche    █████░░░░░░░  42 % verbraucht · 58 % frei · im Plan (neu ab Mo 12:00)
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
| `openPane` | `false` | Keeps the pane closed at start (default `true`: it opens beside the chat) |

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

- **Writes** three small files in `~/.claude/quanta-costa/`, each with a backup copy written at most every ten minutes. `value.json`: for the last three periods, per session id and run, the first and the highest cost reading, and the moment counting began. `week.json`: the value per period and how much of the week was used when Quanta Costa first saw the current week. `ledger.json`: which notices were shown, and the amounts versions before 1.6.1 booked. No prompts, no code, no file names.
- **Reads** those files, and its own entry in `~/.claude/settings.json` when Claude Code hands over no settings. Nothing else.

### My computer crashed. Is the Value total gone?

No. A crash can leave a file that was just being written empty. Since 1.5.4 Quanta Costa keeps a second copy that is written at most every ten minutes, so it has long reached the disk, and it reads whatever of both is intact. You lose at most the last minutes, never the period. A damaged store of Claude Code's own no longer stops the booking either.

---

## Troubleshooting

### I only see two rows and dollars instead of euros.

Your settings did not arrive. The Claude desktop app loads a plugin installed from a local folder under the name `quanta-costa@inline`, while `claude plugin configure` stores the options under `quanta-costa@<marketplace>`. Since 1.3.2 Quanta Costa looks up its own entry in `~/.claude/settings.json` under any of its names. Update to the latest version, then check the last line of the help.

### Value was far higher than my sessions cost (1.5.2 to 1.6.0).

Fixed in 1.6.1. All sessions write the same file. When one of them wrote back what it had read a moment earlier, a session could count its latest cost a second time. With many sessions open at once, Value could reach twice the real amount or more. Since 1.6.1 each run keeps only its own first and highest reading, so an old copy can delay a number but never count it twice.

The amounts booked before the update stay as they were. To start clean, delete `ledger.json` and `ledger.backup.json` in `~/.claude/quanta-costa/` after updating: Value then counts from that moment and says since when.

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

Then start a new session. In the Claude desktop app, quit it completely from the tray icon and open it again: each desktop session keeps the version that was installed when it started, so `/reload-plugins` there reloads the old one. The help shows the version that runs.

### On my phone, `/quanta-costa` went to Claude as a normal message.

That is how it works on the phone: the mobile app sends it as plain text, and Claude answers with the numbers, which Quanta Costa hands it along with the message. If Claude answers something else, your computer still runs a version before 1.5.3: update, then restart Claude on your computer (the desktop app: quit it completely and open it again).

### The band disappeared for a moment.

When Claude Code shows its own feedback survey above the prompt, Quanta Costa steps aside and comes back afterwards.

---

## Install, update, uninstall

### How do I install it?

In a shell, in one line, with your settings:

```bash
claude plugin install quanta-costa --marketplace wukonigcom/quanta-costa --config billingDay=29 --config currency=EUR --config planPrice=180
```

Or inside Claude Code: `/plugin marketplace add wukonigcom/quanta-costa`, then `/plugin install quanta-costa@quanta-costa`.

Then start a new session. In the Claude desktop app, quit it completely from the tray icon and open it again. A plugin in the user scope also runs there, in the Code tab.

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
