# ChartSense

**Drop a TradingView screenshot → get a short plain-English technical read: levels, a TradingView-style gauge, and a confidence score you can audit.**

Local-first Next.js. Your key only ever goes to the provider you choose. No account, no telemetry, no server of mine.

![ChartSense walkthrough](docs/chartsense-demo.gif)

## Why it's not another "AI reads my chart"

Vision models fake precision. ChartSense never hides which number is real:

- **Every value carries its source** — `calculated` · `read` off the screenshot · `estimated` (always with a `~`) · `no basis`.
- **Paste OHLCV candles and the maths stops being AI** — SMA, EMA, RSI, MACD, Stochastic, ADX and ATR computed in TypeScript from your data, overwriting whatever the model guessed.
- **The confidence score is code, not vibes** — base 50 plus ten capped factors, de-duplicated and recomputed server-side, so a model cannot inflate it. Clamped to 5–85: one screenshot can never be certain.
- **No news, no fundamentals, no predictions.** Levels come from the chart or your data, and every plan ends with *wait for clear price confirmation*.

## What you actually get

```text
NIFTY 50 · 5m · LTP 22395.0
Verdict: Strong Sell (TradingView gauge 15/100) · Signal clarity 78/100 — how clean the read is, not the odds of profit

Nifty 50 is in a firm intraday downtrend after breaking below the 22474.7 breakdown level. Price continues to
print lower highs and lower lows with all key moving averages sloping overhead.

• Support: 22355.5 and 22305.6
• Resistance: 22474.7, 22576.7 and 22719.9

   +15 Moving average alignment: Price is trading well below all estimated short and intermediate moving averages.
   +15 Trend strength (ADX): ADX is at 40.28 with DI- dominant at 27.4, indicating a strong downtrend.
    -5 Oscillator agreement: RSI has dipped into oversold territory (28.25), warning of potential short-term pullbacks.
   -10 Signal freshness: The sell signal originated at 22583.85 and the move is already quite extended.

• Trigger: Rejection on a retest of 22440.0 - 22474.7   • Invalidation: 22500.0   • Target: 22355.5   • RR: 2.3:1
```

Real output from a Gemini read of a NIFTY 50 5m chart, trimmed. Copy any read as text or download it as `.txt`, then
keep asking about the same chart in the chat panel.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

Click **Connect AI keys**, paste one key — Grok, OpenAI, Gemini or OpenRouter — hit **Test key**, then **Save keys**.
No key yet? Demo mode still runs the real indicator maths on candles you paste.

Keys are stored in `~/.chartsense`, outside the project folder, so copying or publishing this source can never carry
one. Localhost is open by design; any other host is refused until you set `CHARTSENSE_ACCESS_TOKEN`, and every route
has per-IP rate limits plus body, image and input validation. Details in [SECURITY.md](SECURITY.md).

---

Built by **Khushal Jain** · [@khushaljain023 on TradingView](https://in.tradingview.com/u/khushaljain023/) ·
[MIT](LICENSE) · Educational technical read only, not investment advice.
