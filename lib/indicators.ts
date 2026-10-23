import type { SignalItem } from "./types";

/**
 * Exact indicator maths from pasted candle data. A vision model reading a screenshot can only
 * guess at an EMA 200; given the closes these numbers are arithmetic, so they win over guesses.
 */

export interface Candle {
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

export interface IndicatorReport {
  candles: number;
  lastClose: number;
  rangeHigh: number;
  rangeLow: number;
  adxValue: number | null;
  signals: SignalItem[];
  trendStrength: string;
  skipped: string[];
}

const number = (value: string): number => Number.parseFloat(value.replace(/[,$\s]/g, ""));

/** Accepts `date,open,high,low,close[,volume]`, tab or space separated rows, or a bare list of closes. */
export function parseCandles(raw: string): Candle[] {
  const rows = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) =>
      line
        .split(/[,\t ;]+/)
        .map((cell) => cell.trim())
        .filter((cell) => cell && /^-?[\d,.$]+$/.test(cell) && Number.isFinite(number(cell)))
        .map(number)
    );

  const candles: Candle[] = [];
  for (const cells of rows) {
    if (cells.length === 0) continue;
    const tail = cells.slice(-5);
    let open: number;
    let high: number;
    let low: number;
    let close: number;
    let volume: number | null = null;
    if (tail.length >= 5) {
      [open, high, low, close, volume] = tail;
    } else if (tail.length === 4) {
      [open, high, low, close] = tail;
    } else if (tail.length === 3) {
      [high, low, close] = tail;
      open = close;
    } else {
      close = tail[tail.length - 1];
      open = high = low = close;
    }
    candles.push({
      high: Math.max(high, low, close),
      low: Math.min(high, low, close),
      close,
      volume: volume !== null && Number.isFinite(volume) ? volume : null,
    });
  }
  return candles.filter((candle) => candle.close > 0);
}

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const window = values.slice(-period);
  return window.reduce((total, value) => total + value, 0) / period;
}

function emaSeries(values: number[], period: number): number[] | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((total, value) => total + value, 0) / period;
  const out = [ema];
  for (let index = period; index < values.length; index += 1) {
    ema = values[index] * k + ema * (1 - k);
    out.push(ema);
  }
  return out;
}

function ema(values: number[], period: number): number | null {
  const series = emaSeries(values, period);
  return series ? series[series.length - 1] : null;
}

function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = closes[index] - closes[index - 1];
    if (change >= 0) gain += change;
    else loss -= change;
  }
  gain /= period;
  loss /= period;
  for (let index = period + 1; index < closes.length; index += 1) {
    const change = closes[index] - closes[index - 1];
    gain = (gain * (period - 1) + Math.max(change, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-change, 0)) / period;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

function stochastic(candles: Candle[], period = 14, smooth = 3): { k: number; d: number } | null {
  if (candles.length < period + smooth - 1) return null;
  const raw: number[] = [];
  for (let index = period - 1; index < candles.length; index += 1) {
    const window = candles.slice(index - period + 1, index + 1);
    const high = Math.max(...window.map((candle) => candle.high));
    const low = Math.min(...window.map((candle) => candle.low));
    raw.push(high === low ? 50 : ((candles[index].close - low) / (high - low)) * 100);
  }
  const kSeries: number[] = [];
  for (let index = smooth - 1; index < raw.length; index += 1) {
    kSeries.push(raw.slice(index - smooth + 1, index + 1).reduce((total, value) => total + value, 0) / smooth);
  }
  if (kSeries.length < smooth) return null;
  const k = kSeries[kSeries.length - 1];
  const d = kSeries.slice(-smooth).reduce((total, value) => total + value, 0) / smooth;
  return { k, d };
}

/** Wilder's ADX with DI+ / DI-. The smoothed true range is a running sum, so ATR divides it by the period. */
function adx(candles: Candle[], period = 14): { adx: number; plus: number; minus: number; atr: number } | null {
  if (candles.length < period * 2 + 1) return null;
  const tr: number[] = [];
  const plusDm: number[] = [];
  const minusDm: number[] = [];
  for (let index = 1; index < candles.length; index += 1) {
    const current = candles[index];
    const previous = candles[index - 1];
    tr.push(Math.max(current.high - current.low, Math.abs(current.high - previous.close), Math.abs(current.low - previous.close)));
    const up = current.high - previous.high;
    const down = previous.low - current.low;
    plusDm.push(up > down && up > 0 ? up : 0);
    minusDm.push(down > up && down > 0 ? down : 0);
  }
  const smooth = (values: number[]) => {
    let sum = values.slice(0, period).reduce((total, value) => total + value, 0);
    const out = [sum];
    for (let index = period; index < values.length; index += 1) {
      sum = sum - sum / period + values[index];
      out.push(sum);
    }
    return out;
  };
  const atr = smooth(tr);
  const plus = smooth(plusDm);
  const minus = smooth(minusDm);
  const dx: number[] = [];
  for (let index = 0; index < atr.length; index += 1) {
    const diPlus = (plus[index] / atr[index]) * 100;
    const diMinus = (minus[index] / atr[index]) * 100;
    dx.push(diPlus + diMinus === 0 ? 0 : (Math.abs(diPlus - diMinus) / (diPlus + diMinus)) * 100);
  }
  const last = dx.length - 1;
  const lastPlus = (plus[last] / atr[last]) * 100;
  const lastMinus = (minus[last] / atr[last]) * 100;
  let value = dx.slice(0, period).reduce((total, item) => total + item, 0) / period;
  for (let index = period; index < dx.length; index += 1) {
    value = (value * (period - 1) + dx[index]) / period;
  }
  return { adx: value, plus: lastPlus, minus: lastMinus, atr: atr[atr.length - 1] / period };
}

const round = (value: number, digits = 1): number => Number(value.toFixed(digits));
const side = (price: number, level: number): SignalItem["verdict"] => (price >= level ? "buy" : "sell");

export function computeIndicators(candles: Candle[]): IndicatorReport | null {
  if (candles.length < 20) return null;
  const closes = candles.map((candle) => candle.close);
  const price = closes[closes.length - 1];
  const signals: SignalItem[] = [];
  const skipped: string[] = [];

  for (const [name, period] of [["SMA 10", 10], ["SMA 20", 20], ["SMA 50", 50], ["SMA 100", 100], ["SMA 200", 200]] as const) {
    const value = sma(closes, period);
    if (value === null) {
      skipped.push(`${name} (needs ${period} candles, you pasted ${candles.length})`);
      continue;
    }
    signals.push({
      name,
      reading: String(round(value)),
      verdict: side(price, value),
      source: "computed",
      note: `price ${price >= value ? "above" : "below"} by ${round(Math.abs(price - value))}`,
    });
  }

  for (const [name, period] of [["EMA 20", 20], ["EMA 50", 50], ["EMA 200", 200]] as const) {
    const value = ema(closes, period);
    if (value === null) {
      skipped.push(`${name} (needs ${period} candles)`);
      continue;
    }
    signals.push({
      name,
      reading: String(round(value)),
      verdict: side(price, value),
      source: "computed",
      note: `price ${price >= value ? "above" : "below"} by ${round(Math.abs(price - value))}`,
    });
  }

  const oscillators: SignalItem[] = [];
  const rsiValue = rsi(closes);
  if (rsiValue === null) skipped.push("RSI (14)");
  else
    oscillators.push({
      name: "RSI (14)",
      reading: String(round(rsiValue, 2)),
      verdict: rsiValue >= 70 ? "sell" : rsiValue <= 30 ? "buy" : "neutral",
      source: "computed",
      note: rsiValue >= 70 ? "overbought" : rsiValue <= 30 ? "oversold" : "mid-range",
    });

  const fast = emaSeries(closes, 12);
  const slow = emaSeries(closes, 26);
  if (fast === null || slow === null) skipped.push("MACD (12,26,9)");
  else {
    // The signal line is an EMA of the MACD line itself, so the two EMAs have to be aligned first.
    const offset = fast.length - slow.length;
    const macdLine = slow.map((value, index) => fast[index + offset] - value);
    const signalSeries = emaSeries(macdLine, 9);
    const line = macdLine[macdLine.length - 1];
    const signal = signalSeries ? signalSeries[signalSeries.length - 1] : null;
    const histogram = signal === null ? null : line - signal;
    oscillators.push({
      name: "MACD (12,26,9)",
      reading: signal === null ? `line ${round(line, 3)}` : `line ${round(line, 3)} · signal ${round(signal, 3)}`,
      verdict: histogram === null ? "neutral" : histogram > 0 ? "buy" : histogram < 0 ? "sell" : "neutral",
      source: "computed",
      note: histogram === null ? "not enough candles for the signal line" : histogram > 0 ? "positive histogram" : "negative histogram",
    });
  }

  const stoch = stochastic(candles);
  if (stoch === null) skipped.push("Stochastic (14,3,3)");
  else
    oscillators.push({
      name: "Stochastic (14,3,3)",
      reading: `%K ${round(stoch.k, 1)} · %D ${round(stoch.d, 1)}`,
      verdict: stoch.k >= 80 ? "sell" : stoch.k <= 20 ? "buy" : stoch.k > stoch.d ? "buy" : "sell",
      source: "computed",
      note: stoch.k >= 80 ? "overbought zone" : stoch.k <= 20 ? "oversold zone" : `%K ${stoch.k > stoch.d ? "above" : "below"} %D`,
    });

  const trend = adx(candles);
  let trendStrength = "";
  const adxValue = trend === null ? null : round(trend.adx, 2);
  if (trend === null) skipped.push("ADX (14)");
  else {
    const strength = trend.adx < 20 ? "no clear trend" : trend.adx < 25 ? "emerging trend" : trend.adx < 40 ? "moderate trend" : "strong trend";
    const direction = trend.plus === trend.minus ? "DI+ and DI- are level" : trend.plus > trend.minus ? "DI+ ahead, buyers in control" : "DI- ahead, sellers in control";
    trendStrength = `ADX ${round(trend.adx, 2)} = ${strength}; DI+ ${round(trend.plus, 2)} vs DI- ${round(trend.minus, 2)}, so ${direction}. ATR about ${round(trend.atr, 2)}.`;
    oscillators.push({
      name: "ADX (14)",
      reading: `${round(trend.adx, 2)} · DI+ ${round(trend.plus, 2)} · DI- ${round(trend.minus, 2)}`,
      verdict: trend.adx < 20 ? "neutral" : trend.plus > trend.minus ? "buy" : "sell",
      source: "computed",
      note: strength,
    });
  }

  const volumes = candles.map((candle) => candle.volume).filter((value): value is number => value !== null);
  if (volumes.length >= 20) {
    const recent = volumes.slice(-5).reduce((total, value) => total + value, 0) / 5;
    const baseline = volumes.slice(-40, -5).length ? volumes.slice(-40, -5).reduce((total, value) => total + value, 0) / volumes.slice(-40, -5).length : recent;
    const ratio = baseline === 0 ? 1 : recent / baseline;
    oscillators.push({
      name: "Volume",
      reading: `last 5 bars ${round(ratio, 2)}x the recent average`,
      verdict: ratio >= 1.3 ? side(price, sma(closes, 20) ?? price) : "neutral",
      source: "computed",
      note: ratio >= 1.3 ? "expanding volume behind the move" : "volume not confirming",
    });
  }

  return {
    candles: candles.length,
    lastClose: round(price),
    rangeHigh: round(Math.max(...candles.map((candle) => candle.high))),
    rangeLow: round(Math.min(...candles.map((candle) => candle.low))),
    adxValue,
    signals: [...signals, ...oscillators],
    trendStrength,
    skipped,
  };
}

export function indicatorsForPrompt(report: IndicatorReport): string {
  const rows = report.signals.map((signal) => `${signal.name} = ${signal.reading} → ${signal.verdict.toUpperCase()} (${signal.note ?? ""})`);
  return [
    `The user pasted ${report.candles} candles of real OHLC data. These indicators were calculated from that data on the server, so they are exact — use them instead of estimating, and give each one source "computed".`,
    `Last close ${report.lastClose}. Visible data range: low ${report.rangeLow} to high ${report.rangeHigh}.`,
    rows.join("\n"),
    report.trendStrength ? `Trend strength: ${report.trendStrength}` : "",
    report.skipped.length ? `Could not be calculated from this much data: ${report.skipped.join(", ")}.` : "",
    "The screenshot is still the source for drawn levels, trendlines and the visible structure; the numbers above are the source for indicator values.",
  ]
    .filter(Boolean)
    .join("\n");
}
