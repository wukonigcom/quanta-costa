# 🧾 Quanta Costa: Claude Code usage limits and session cost, right above the prompt

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-D97757.svg)](https://claude.com/claude-code)

**How much of your Claude plan is left, and what is this session costing you?**
Quanta Costa is a [Claude Code](https://claude.com/claude-code) plugin that answers both at a glance. It shows your **billing period**, your **weekly usage limit** and the **cost of the current session** (tokens plus dollars or euros) as a compact band right above the prompt. It works in the terminal and in the Claude desktop app.

```
🧾 Period   ████░░░░░░░░  1.4 of 4.3 weeks gone · 2.9 wk left · renews in 20 days
   Week     ██████░░░░░░  50% used · 50% free (resets Oct 12)
   Session  3.3M tokens · $4.95 · last prompt $0.07 · 85k tokens   [Help]
```

## Features

- **Weekly limit bar** for Claude Pro and Max: how much is used, how much is free, when it resets. Green, yellow from 70%, red from 90%.
- **Billing period bar**: how many weeks of the month you paid for are gone and how many are left.
- **Session cost** in tokens and in dollars or euros, plus the cost of your **last prompt**. Updates live after every tool call.
- **5-hour limit warning**: the short-term window only shows up when it passes 80%, with the time it frees up again.
- **Built-in help**: one click explains every number, including whether the costs are real.
- **Private by design**: no network calls, no file access. All numbers come from Claude Code itself.

## Install

Type this at the prompt of a Claude Code session in your terminal:

```
/plugin install quanta-costa --marketplace wukonigcom/quanta-costa
```

Answer `y` to add the marketplace, pick the **user** scope with Enter, then set the options. A plugin installed for the user scope also runs in the Claude desktop app (Code tab).

## Settings

| Setting | What it does | Default |
| --- | --- | --- |
| `billingDay` | Day of the month your subscription renews (1 to 31). It is on your Anthropic receipt. `0` hides the Period row. | `0` |
| `currency` | `USD` or `EUR` | `USD` |
| `eurRate` | Euros per US dollar, used with `EUR` | `0.89238` (ECB, 2026-10-09) |

Change them later with `/plugin configure quanta-costa` in Claude Code or `claude plugin configure quanta-costa` in a shell.

## FAQ

**Are the costs real?**
On a Claude subscription (Pro or Max): no, they are hypothetical. Quanta Costa shows what the session would cost at API list prices, the same figure `/cost` totals. You do not pay it on top; it only counts against your weekly allowance. You only really pay for extra usage beyond your limit, if you turned it on. On an API key, Claude Code reports no subscription limits, and the help says the costs are real.

**What are the weekly limit and the 5-hour limit?**
Claude plans meter usage in two windows: a weekly allowance and a short 5-hour window. Quanta Costa shows the weekly one as a bar and only warns about the 5-hour one when it gets tight, because that is the one that usually stops you.

**Why is there no Period row?**
Claude Code does not know your billing date. Set `billingDay` once and the row appears.

**Why do the tokens start at zero mid-session?**
Tokens are summed from the moment the plugin loads. The dollar or euro amount always covers the whole session.

**Does it send my data anywhere?**
No. It reads Claude Code's own usage figures through the plugin API and draws them. Nothing leaves your machine.

**How is it different from ccusage?**
[ccusage](https://github.com/ryoppippi/ccusage) analyses Claude Code's log files after the fact, from the command line. Quanta Costa lives inside Claude Code and shows the live numbers while you work.

## Requirements

Claude Code 2.1.293 or newer. Quanta Costa uses Claude Code's function-hooks plugin API, which is in early access and may change between releases.

## Deutsch

Quanta Costa zeigt in Claude Code direkt über dem Prompt, wie viel von deinem Claude-Abo noch frei ist (Woche und Abrechnungsperiode als Balken) und was die laufende Sitzung in Tokens und Euro kosten würde. Mit Abo sind die Kosten theoretisch: Sie zählen nur gegen dein Wochenkontingent. Installation wie oben, für Euro `currency` auf `EUR` stellen, `billingDay` auf deinen Abrechnungstag.

## License

MIT, see [LICENSE](LICENSE). Made by Jörg Wukonig, [Wukonig & Partner](https://wukonig.com).
