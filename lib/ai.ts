import { MODEL_CANDIDATES, rememberModel, resolveProvider } from "./config";
import { computeIndicators, parseCandles, type IndicatorReport } from "./indicators";
import { systemPrompt, userPrompt } from "./prompt";
import type { Analysis, ConfidenceFactor, Provider, SignalItem, Verdict } from "./types";

export interface AnalyzeInput {
  images: string[];
  hint?: string;
  marketData?: string;
  language?: "english" | "hinglish";
  provider?: Provider;
}

export interface AnalyzeResult {
  analysis: Analysis;
  provider: Provider;
  model: string;
  demo: boolean;
}

const TIMEOUT_MS = 180_000;

export class ProviderError extends Error {}

type OpenAiLike = "openai" | "grok" | "openrouter";

const OPENAI_LIKE_URL: Record<OpenAiLike, string> = {
  openai: "https://api.openai.com/v1",
  grok: "https://api.x.ai/v1",
  openrouter: "https://openrouter.ai/api/v1",
};

const isOpenAiLike = (provider: Provider): provider is OpenAiLike => provider in OPENAI_LIKE_URL;

function chatEngine(provider: Provider): OpenAiLike | "gemini" {
  if (provider === "gemini") return "gemini";
  if (isOpenAiLike(provider)) return provider;
  throw new ProviderError("No provider configured.");
}

const AUTH_ERROR = /api key not valid|incorrect api key|invalid api key|unauthorized|permission|\b401\b|\b403\b|quota|billing|insufficient|out of credit/i;
const MODEL_ERROR = /model_not_found|not found|invalid model|unknown model|does not exist|no such model|no model|\b404\b/i;
const OVERLOAD_ERROR = /\b503\b|\b429\b|overload|high demand|capacity|try again later|rate limit/i;

async function getJson(url: string, headers: Record<string, string>): Promise<any> {
  let response: Response;
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    throw new ProviderError(`Could not reach the provider (${(error as Error).name}).`);
  }
  const text = await response.text();
  if (!response.ok) {
    let message = text.slice(0, 300);
    try {
      const parsed = JSON.parse(text);
      message = parsed?.error?.message ?? parsed?.error ?? message;
    } catch {
      /* keep raw text */
    }
    throw new ProviderError(`${response.status}: ${message}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderError("The provider returned a response we could not read.");
  }
}

function stripDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) throw new ProviderError("Image upload was malformed. Please drop the screenshot again.");
  return { mimeType: match[1], base64: match[2] };
}

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<any> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new ProviderError(`Could not reach the provider (${(error as Error).name}). Check your internet connection.`);
  }
  const text = await response.text();
  if (!response.ok) {
    let message = text.slice(0, 400);
    try {
      const parsed = JSON.parse(text);
      message = parsed?.error?.message ?? parsed?.error?.status ?? parsed?.message ?? message;
    } catch {
      /* keep raw text */
    }
    const error = new ProviderError(`${response.status}: ${message}`) as ProviderError & { status?: number };
    error.status = response.status;
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderError("The provider returned a response we could not read.");
  }
}

async function callOpenAiCompatible(
  provider: OpenAiLike,
  model: string,
  apiKey: string,
  system: string,
  text: string,
  images: string[]
): Promise<string> {
  const baseUrl = OPENAI_LIKE_URL[provider];
  const content: unknown[] = [{ type: "text", text }];
  for (const image of images) {
    content.push({ type: "image_url", image_url: { url: image } });
  }
  const data = await postJson(
    `${baseUrl}/chat/completions`,
    {
      authorization: `Bearer ${apiKey}`,
      ...(provider === "openrouter" ? { "http-referer": "http://localhost:3000", "x-title": "ChartSense" } : {}),
    },
    {
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content },
      ],
      // OpenRouter forwards this to the upstream provider, which rejects it for some models —
      // there we rely on the JSON-only instruction plus extractJson().
      ...(provider === "openrouter" ? {} : { response_format: { type: "json_object" } }),
      ...(provider === "openai" ? { max_completion_tokens: 6000 } : { max_tokens: 6000 }),
    }
  );
  const contentOut = data?.choices?.[0]?.message?.content;
  if (typeof contentOut !== "string" || !contentOut.trim()) throw new ProviderError("The model returned an empty answer.");
  return contentOut;
}

async function callGemini(
  model: string,
  apiKey: string,
  system: string,
  text: string,
  images: string[]
): Promise<string> {
  const parts: unknown[] = [{ text }];
  for (const image of images) {
    const { mimeType, base64 } = stripDataUrl(image);
    parts.push({ inline_data: { mime_type: mimeType, data: base64 } });
  }
  const data = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { "x-goog-api-key": apiKey },
    {
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: 4000 },
    }
  );
  const candidate = data?.candidates?.[0];
  const out = candidate?.content?.parts?.map((part: any) => part?.text ?? "").join("").trim();
  if (!out) {
    throw new ProviderError(candidate?.finishReason ? `Model stopped early (${candidate.finishReason}).` : "The model returned an empty answer.");
  }
  return out;
}

function extractJson(raw: string): any {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) throw new ProviderError("The model did not return readable JSON.");
  return JSON.parse(body.slice(start, end + 1));
}

const TONES = new Set(["buy", "sell", "neutral", "unavailable"]);
const SOURCES = new Set(["computed", "read", "estimated", "not visible"]);
const VERDICTS = new Set(["strong_buy", "buy", "neutral", "sell", "strong_sell"]);

function toSignals(value: unknown): SignalItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map((item) => {
    const entry = (item ?? {}) as Record<string, unknown>;
    const verdict = String(entry.verdict ?? "unavailable").toLowerCase();
    const source = String(entry.source ?? (verdict === "unavailable" ? "not visible" : "read")).toLowerCase();
    return {
      name: String(entry.name ?? "Indicator").slice(0, 40),
      reading: String(entry.reading ?? entry.value ?? "not visible").slice(0, 60),
      verdict: (TONES.has(verdict) ? verdict : "unavailable") as SignalItem["verdict"],
      source: (SOURCES.has(source) ? source : "estimated") as SignalItem["source"],
      note: entry.note ? String(entry.note).slice(0, 160) : undefined,
    };
  });
}

/**
 * The model is told these ranges, but a model that ignores them must not be able to inflate a
 * score, and the same evidence described twice must not be counted twice.
 */
const FACTOR_RANGES: [RegExp, number, number][] = [
  [/moving average|\bma\b/i, -10, 20],
  [/oscillator/i, -10, 20],
  [/trend strength|\badx\b/i, -5, 15],
  [/level test|tested level/i, 0, 15],
  [/timeframe|confluence/i, 0, 10],
  [/volume|open interest|\boi\b|pcr/i, -5, 10],
  [/risk|reward/i, -10, 10],
  [/fresh/i, -10, 5],
  [/chop|\brange\b|atr/i, -10, 0],
  [/clarity|screenshot|quality/i, -20, 5],
];

/** FACTOR_RANGES doubles as the documented order the read lists its factors in. */
function factorOrder(label: string): number {
  const key = label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const index = FACTOR_RANGES.findIndex(([pattern]) => pattern.test(key));
  return index === -1 ? FACTOR_RANGES.length : index;
}

function orderFactors(factors: ConfidenceFactor[]): ConfidenceFactor[] {
  return factors.map((factor, index) => ({ factor, index })).sort((a, b) => factorOrder(a.factor.label) - factorOrder(b.factor.label) || a.index - b.index).map((entry) => entry.factor);
}

function toFactors(value: unknown): ConfidenceFactor[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const factors: ConfidenceFactor[] = [];
  for (const item of value) {
    const entry = (item ?? {}) as Record<string, unknown>;
    const label = String(entry.label ?? entry.name ?? "Factor").slice(0, 60);
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (seen.has(key)) continue;
    seen.add(key);
    const raw = typeof entry.points === "number" ? entry.points : Number.parseFloat(String(entry.points ?? "0"));
    const [, min, max] = FACTOR_RANGES.find(([pattern]) => pattern.test(key)) ?? [, -10, 10];
    const points = Number.isFinite(raw) ? Math.max(min, Math.min(max, Math.round(raw))) : 0;
    factors.push({ label, points, reason: String(entry.reason ?? "").slice(0, 200) });
    if (factors.length >= 12) break;
  }
  return factors;
}

function toList(value: unknown, max = 8): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean).slice(0, max);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

export function verdictFromIndex(index: number): Verdict {
  if (index >= 80) return "strong_buy";
  if (index >= 60) return "buy";
  if (index > 40) return "neutral";
  if (index > 20) return "sell";
  return "strong_sell";
}

export function normalise(raw: any): Analysis {
  const gaugeIndex = clampNumber(raw?.gaugeIndex, 0, 100, 50);
  const rawVerdict = String(raw?.verdict ?? "").toLowerCase();
  const analysis: Analysis = {
    instrument: String(raw?.instrument ?? "Unknown instrument").slice(0, 60),
    timeframe: String(raw?.timeframe ?? "Not shown").slice(0, 20),
    lastPrice: String(raw?.lastPrice ?? "—").slice(0, 24),
    verdict: (VERDICTS.has(rawVerdict) ? rawVerdict : verdictFromIndex(gaugeIndex)) as Verdict,
    gaugeIndex,
    bias: String(raw?.bias ?? "neutral").slice(0, 80),
    summary: String(raw?.summary ?? "").slice(0, 1200),
    support: toList(raw?.support, 4),
    resistance: toList(raw?.resistance, 4),
    outlook: String(raw?.outlook ?? "").slice(0, 1600),
    confidence: clampNumber(raw?.confidence, 5, 85, 40),
    confidenceFactors: toFactors(raw?.confidenceFactors),
    confidenceReason: String(raw?.confidenceReason ?? "").slice(0, 400),
    trendStrength: String(raw?.trendStrength ?? "").slice(0, 400),
    movingAverages: toSignals(raw?.movingAverages),
    oscillators: toSignals(raw?.oscillators),
    priceAction: toList(raw?.priceAction, 6),
    riskPlan: raw?.riskPlan
      ? {
          idea: String(raw.riskPlan.idea ?? "").slice(0, 200),
          trigger: String(raw.riskPlan.trigger ?? "").slice(0, 200),
          invalidation: String(raw.riskPlan.invalidation ?? "").slice(0, 200),
          target: String(raw.riskPlan.target ?? "").slice(0, 200),
          riskReward: String(raw.riskPlan.riskReward ?? "").slice(0, 80),
        }
      : null,
    notVisible: toList(raw?.notVisible, 10),
    caveats: toList(raw?.caveats, 5),
  };
  if (analysis.verdict !== verdictFromIndex(gaugeIndex)) analysis.verdict = verdictFromIndex(gaugeIndex);
  if (analysis.confidenceFactors.length > 0) {
    const summed = 50 + analysis.confidenceFactors.reduce((total, factor) => total + factor.points, 0);
    analysis.confidence = clampNumber(summed, 5, 85, analysis.confidence);
  }
  return analysis;
}

function parseModelOutput(raw: string): Analysis {
  try {
    return normalise(extractJson(raw));
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError("The model's answer could not be parsed as analysis JSON. Try a different model or re-drop a sharper screenshot.");
  }
}

async function tryModels<T>(candidates: string[], run: (model: string) => Promise<T>): Promise<{ value: T; model: string }> {
  const failures: string[] = [];
  for (const model of candidates) {
    try {
      return { value: await run(model), model };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${model} → ${message}`);
      const retryable = (MODEL_ERROR.test(message) || OVERLOAD_ERROR.test(message)) && !AUTH_ERROR.test(message);
      if (!retryable) break;
    }
  }
  throw new ProviderError(failures.join(" | ") || "No working model found for this provider.");
}

const MOVING_AVERAGE = /^(sma|ema|wma|hma|vwma|vwap|ma)\s*\d/i;
const OSCILLATOR_NAME = /^(rsi|macd|stoch|cci|momentum|awesome|williams)/i;

/**
 * Three of the ten factors are pure arithmetic once the candles are known, so the app scores those
 * itself instead of trusting a model's description of the same numbers.
 */
function scoredFactors(report: IndicatorReport): ConfidenceFactor[] {
  const leans = (items: SignalItem[]) => ({
    buy: items.filter((item) => item.verdict === "buy").length,
    sell: items.filter((item) => item.verdict === "sell").length,
  });
  const out: ConfidenceFactor[] = [];
  const averages = leans(report.signals.filter((item) => MOVING_AVERAGE.test(item.name)));
  const averageCalls = averages.buy + averages.sell;

  if (averageCalls > 0) {
    const towardBuy = averages.buy >= averages.sell;
    const sameSide = towardBuy ? averages.buy : averages.sell;
    const ratio = sameSide / averageCalls;
    const oscillators = leans(report.signals.filter((item) => OSCILLATOR_NAME.test(item.name)));
    const agree = towardBuy ? oscillators.buy : oscillators.sell;
    const against = towardBuy ? oscillators.sell : oscillators.buy;
    out.push({
      label: "Moving average alignment",
      points: ratio === 1 ? 20 : ratio >= 0.8 ? 14 : ratio >= 0.6 ? 8 : -6,
      reason: `${sameSide} of ${averageCalls} calculated averages lean the same way (price ${towardBuy ? "above" : "below"} them).`,
    });
    if (agree + against > 0) {
      out.push({
        label: "Oscillator agreement",
        points: clampNumber(((agree - against) / (agree + against)) * 20, -10, 20, 0),
        reason: `${agree} of ${agree + against} calculated oscillators point the same way as the averages${against ? `, ${against} point the other way` : ""}.`,
      });
    }
  }

  const adx = report.adxValue;
  if (adx !== null) {
    out.push({
      label: "Trend strength (ADX)",
      points: adx >= 40 ? 15 : adx >= 25 ? 8 : adx >= 20 ? 3 : 0,
      reason: `ADX ${adx} is ${adx >= 40 ? "a strong trend" : adx >= 25 ? "a moderate trend" : adx >= 20 ? "only an emerging trend" : "flat, so there is no trend backing this read"}.`,
    });
  }
  return out;
}

/** TradingView's summary gauge: the average lean of every signal that actually has a verdict. */
function gaugeFromSignals(items: SignalItem[]): { index: number; verdict: Verdict } {
  const scored = items.filter((item) => item.verdict !== "unavailable");
  if (scored.length === 0) return { index: 50, verdict: "neutral" };
  const lean = scored.reduce((total, item) => total + (item.verdict === "buy" ? 1 : item.verdict === "sell" ? -1 : 0), 0) / scored.length;
  const index = clampNumber(50 + lean * 50, 0, 100, 50);
  return { index, verdict: verdictFromIndex(index) };
}

/** Real numbers from pasted candles beat anything a model eyeballed off a screenshot. */
function applyComputed(analysis: Analysis, report: IndicatorReport | null, demoNarrative = false): Analysis {
  if (!report) return analysis;
  const byName = new Map(report.signals.map((signal) => [signal.name.toLowerCase().replace(/[^a-z0-9]/g, ""), signal]));
  const keep = (items: SignalItem[]) => items.filter((item) => !byName.has(item.name.toLowerCase().replace(/[^a-z0-9]/g, "")));
  const computed = report.signals.map((signal) => ({ ...signal }));
  const stated = Number(String(analysis.lastPrice).replace(/[^0-9.-]/g, ""));
  const stale = !Number.isFinite(stated) || Math.abs(stated - report.lastClose) / report.lastClose > 0.001;

  const scored = scoredFactors(report);
  const owned = new Set(scored.map((factor) => factor.label));
  // A missing indicator panel is not a weakness once the values were calculated from candles, and
  // the three arithmetic factors belong to the app, not to the model.
  const clarityPenalty = (factor: ConfidenceFactor) => /clarity|screenshot|quality/i.test(factor.label) && factor.points < 0;
  const clarityDropped = analysis.confidenceFactors.some(clarityPenalty);
  const factors = orderFactors([
    ...analysis.confidenceFactors.filter((factor) => !owned.has(factor.label) && !clarityPenalty(factor)),
    ...scored,
  ]);
  const confidence = factors.length ? clampNumber(50 + factors.reduce((total, factor) => total + factor.points, 0), 5, 85, analysis.confidence) : analysis.confidence;
  // The model's own explanation can describe averages it never saw, so once the app has scored part
  // of the number the app explains it.
  const strongest = factors.reduce((best, factor) => (factor.points > best.points ? factor : best), factors[0]);
  const weakest = factors.reduce((low, factor) => (factor.points < low.points ? factor : low), factors[0]);
  const confidenceReason = factors.length
    ? `${factors.length} factors were added to a base of 50, of which ${scored.length} were scored by the app from the pasted candles. Highest: ${strongest.label} ${strongest.points >= 0 ? "+" : ""}${strongest.points}. Lowest: ${weakest.label} ${weakest.points >= 0 ? "+" : ""}${weakest.points}.`
    : analysis.confidenceReason;

  const movingAverages = [...keep(analysis.movingAverages), ...computed.filter((signal) => MOVING_AVERAGE.test(signal.name))];
  const oscillators = [...keep(analysis.oscillators), ...computed.filter((signal) => !MOVING_AVERAGE.test(signal.name))];
  const gauge = gaugeFromSignals([...movingAverages, ...oscillators]);

  return {
    ...analysis,
    lastPrice: String(report.lastClose),
    // The demo paragraph quotes the sample chart's indicators, which would contradict the real
    // numbers calculated from the candles pasted alongside it.
    summary: demoNarrative
      ? `Key-free demo read, so this paragraph is a fixed sample and its wording means nothing. Everything in the tables below is calculated from the ${report.candles} candles you pasted: last close ${report.lastClose}, ${report.signals.length} indicators, data range ${report.rangeLow} to ${report.rangeHigh}. ${report.trendStrength}`
      : analysis.summary,
    gaugeIndex: gauge.index,
    verdict: gauge.verdict,
    confidence,
    confidenceReason,
    confidenceFactors: factors,
    movingAverages,
    oscillators,
    // Same reason: the sample's drawn levels belong to the sample chart, not to their pasted data.
    support: demoNarrative ? [String(report.rangeLow)] : analysis.support,
    resistance: demoNarrative ? [String(report.rangeHigh)] : analysis.resistance,
    outlook: demoNarrative
      ? `From your ${report.candles} pasted candles the only real levels are the data range: ${report.rangeLow} low to ${report.rangeHigh} high, last close ${report.lastClose}. A close beyond either edge is the confirmation this data can give. The if-then plan needs a model read, so add an API key in Settings.`
      : analysis.outlook,
    riskPlan: demoNarrative ? null : analysis.riskPlan,
    trendStrength: report.trendStrength || analysis.trendStrength,
    caveats: [
      `Indicator values come from ${report.candles} candles of pasted price data (exact), not from the screenshot.`,
      ...(clarityDropped ? ["The usual penalty for a missing indicator panel was not applied, because those values were calculated."] : []),
      ...(stale ? [`Signals are calculated to the last pasted close ${report.lastClose}; the screenshot read ${analysis.lastPrice}.`] : []),
      ...analysis.caveats,
    ].slice(0, 5),
  };
}

export async function analyzeChart(input: AnalyzeInput): Promise<AnalyzeResult> {
  const language = input.language ?? "english";
  const report = computeIndicators(parseCandles(input.marketData ?? ""));
  const resolved = await resolveProvider(input.provider);

  if (resolved.provider === "demo") {
    // Pasted candles are exact, so even the key-free demo read shows the real numbers.
    return { analysis: applyComputed(normalise(DEMO_SAMPLE), report, true), provider: "demo", model: "demo", demo: true };
  }

  const system = systemPrompt(language);
  const text = userPrompt(input.images.length, input.hint ?? "", report);
  const engine = chatEngine(resolved.provider);
  const { value, model } = await tryModels(resolved.candidates, async (candidate) => {
    const raw =
      engine === "gemini"
        ? await callGemini(candidate, resolved.apiKey, system, text, input.images)
        : await callOpenAiCompatible(engine, candidate, resolved.apiKey, system, text, input.images);
    return parseModelOutput(raw);
  });
  await rememberModel(resolved.provider, model);
  return { analysis: applyComputed(value, report), provider: resolved.provider, model, demo: false };
}

export async function chatWithChart(options: {
  provider?: Provider;
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  images: string[];
}): Promise<{ reply: string; provider: Provider; model: string }> {
  const resolved = await resolveProvider(options.provider);
  if (resolved.provider === "demo") {
    return {
      reply:
        "Demo mode me main chat ke liye AI call nahi karta. Settings me koi ek API key (Grok / OpenAI / Gemini / OpenRouter) daal do, phir main is chart par sawaal-jawaab kar paunga.",
      provider: "demo",
      model: "demo",
    };
  }
  const lastUser = [...options.messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const history = options.messages.slice(0, -1);
  const engine = chatEngine(resolved.provider);

  const { value: reply, model } = await tryModels(resolved.candidates, async (candidate) => {
    if (engine === "gemini") {
      const parts: unknown[] = [];
      for (const image of options.images) {
        const { mimeType, base64 } = stripDataUrl(image);
        parts.push({ inline_data: { mime_type: mimeType, data: base64 } });
      }
      parts.push({ text: lastUser });
      const data = await postJson(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(candidate)}:generateContent`,
        { "x-goog-api-key": resolved.apiKey },
        {
          system_instruction: { parts: [{ text: options.system }] },
          contents: [
            ...history.map((message) => ({
              role: message.role === "assistant" ? "model" : "user",
              parts: [{ text: message.content }],
            })),
            { role: "user", parts },
          ],
          generationConfig: { temperature: 0.3, maxOutputTokens: 1200 },
        }
      );
      const text = data?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text ?? "").join("").trim();
      if (!text) throw new ProviderError("The model returned an empty answer.");
      return text;
    }

    const content: unknown[] = [];
    for (const image of options.images) {
      content.push({ type: "text", text: "Chart for reference." });
      content.push({ type: "image_url", image_url: { url: image } });
    }
    content.push({ type: "text", text: lastUser });

    const data = await postJson(
      `${OPENAI_LIKE_URL[engine]}/chat/completions`,
      {
        authorization: `Bearer ${resolved.apiKey}`,
        ...(engine === "openrouter" ? { "http-referer": "http://localhost:3000", "x-title": "ChartSense" } : {}),
      },
      {
        model: candidate,
        messages: [
          { role: "system", content: options.system },
          ...history.map((message) => ({ role: message.role, content: message.content })),
          { role: "user", content },
        ],
        ...(engine === "openai" ? { max_completion_tokens: 1200 } : { max_tokens: 1200 }),
      }
    );
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new ProviderError("The model returned an empty answer.");
    return text;
  });

  await rememberModel(resolved.provider, model);
  return { reply, provider: resolved.provider, model };
}

async function askOnce(provider: OpenAiLike | "gemini", model: string, apiKey: string): Promise<void> {
  if (provider === "gemini") {
    await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { "x-goog-api-key": apiKey }, {
      contents: [{ role: "user", parts: [{ text: "Reply with the single word: ok" }] }],
      generationConfig: { maxOutputTokens: 10 },
    });
    return;
  }
  await postJson(`${OPENAI_LIKE_URL[provider]}/chat/completions`, { authorization: `Bearer ${apiKey}` }, {
    model,
    messages: [{ role: "user", content: "Reply with the single word: ok" }],
  });
}

export async function pingProvider(provider: Provider, apiKey: string, preferredModel?: string): Promise<string> {
  const target: OpenAiLike | "gemini" | null = provider === "gemini" ? "gemini" : isOpenAiLike(provider) ? provider : null;
  if (!target) throw new ProviderError("Unknown provider.");

  const candidates = [preferredModel?.trim(), ...(target === "gemini" ? MODEL_CANDIDATES.gemini : MODEL_CANDIDATES[target])]
    .filter((model, index, list): model is string => Boolean(model) && list.indexOf(model) === index)
    .slice(0, 5);

  const failures: string[] = [];
  for (const model of candidates) {
    try {
      await askOnce(target, model, apiKey);
      await rememberModel(provider, model, { force: true });
      return model;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${model} → ${message}`);
      if (AUTH_ERROR.test(message)) break;
    }
  }
  const detail = AUTH_ERROR.test(failures[0] ?? "")
    ? `${failures[0]} — this key is not valid for ${provider}. Check you pasted the right provider's key.`
    : failures.join(" | ");
  throw new ProviderError(detail || "Unknown provider");
}

export interface ModelOption {
  id: string;
  label: string;
  vision: boolean;
}

const NON_VISION_HINT = /embed|tts|audio|transcri|realtime|image-|preview|moderation|dall|rerank|speech|vanilla/i;

export async function listModels(provider: Provider, apiKey: string): Promise<ModelOption[]> {
  if (provider === "demo") return [];
  const headers: Record<string, string> =
    provider === "gemini" ? { "x-goog-api-key": apiKey } : { authorization: `Bearer ${apiKey}` };
  const url =
    provider === "gemini"
      ? "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200"
      : `${OPENAI_LIKE_URL[provider]}/models`;

  let data: any;
  try {
    data = await getJson(url, headers);
  } catch (error) {
    throw new ProviderError(error instanceof Error ? error.message : "Could not load the model list.");
  }

  const raw: any[] = provider === "gemini" ? data?.models ?? [] : data?.data ?? [];
  const options = raw
    .map((entry): ModelOption | null => {
      const id = String(entry?.id ?? entry?.name ?? "").replace(/^models\//, "");
      if (!id) return null;
      const methods: string[] | undefined = entry?.supportedGenerationMethods;
      if (methods && !methods.includes("generateContent")) return null;
      const modalities: string[] | undefined = entry?.architecture?.input_modalities;
      const vision = modalities ? modalities.includes("image") : !NON_VISION_HINT.test(id);
      return { id, label: String(entry?.label ?? entry?.name ?? id), vision };
    })
    .filter((entry): entry is ModelOption => Boolean(entry) && (entry as ModelOption).vision);

  if (options.length === 0) throw new ProviderError("No image-capable model was returned for this key. Type a model name yourself.");
  return options.sort((a, b) => Number(a.id.startsWith("~")) - Number(b.id.startsWith("~")) || a.id.localeCompare(b.id)).slice(0, 250);
}

const DEMO_SAMPLE = {
  instrument: "NIFTY 50 (demo sample)",
  timeframe: "15m",
  lastPrice: "22651.3",
  verdict: "neutral",
  gaugeIndex: 46,
  bias: "neutral to mildly bearish",
  summary:
    "Nifty is showing a neutral to mildly bearish short-term bias, with price consolidating near the Break Down at 22640.5 after the earlier Sell signal. ADX at 26.2 indicates moderate trend strength, DI+ and DI– are nearly balanced, and RSI near 51.8 remains neutral.",
  support: ["22640.5", "22489.2"],
  resistance: ["22770", "22890.1"],
  outlook:
    "The short-term structure stays cautious while Nifty holds below 22770. A sustained break below 22640.5 could open the path toward 22489.2 and lower targets. However, a recovery above 22770 may ease the downside bias and bring 22890.1 into focus. Wait for clear price confirmation before making trading decisions.",
  confidenceFactors: [
    { label: "Moving average alignment", points: 6, reason: "Price is below the short averages but above the long one." },
    { label: "Oscillator agreement", points: -6, reason: "RSI is mid-range while MACD leans bearish, so they do not agree." },
    { label: "Trend strength (ADX)", points: 3, reason: "ADX 26 is only emerging-to-moderate, not a strong trend." },
    { label: "Level test quality", points: 10, reason: "Price is sitting right on the 22640.5 break-down level." },
    { label: "Risk to reward of the plan", points: 4, reason: "About 1.9 : 1 to the first target." },
    { label: "Signal freshness", points: -9, reason: "The break already ran, so a fresh entry is late." },
    { label: "Range chop vs ATR", points: -14, reason: "Bars are inside a narrow range, breaks from here often fail." },
    { label: "Screenshot clarity", points: -6, reason: "No moving averages plotted, so several signals are estimated." },
  ],
  confidence: 38,
  confidenceReason:
    "Moving averages lean bearish but the oscillators are split and ADX is only moderate, so the signals do not line up. DI+ and DI- being nearly balanced is what keeps the score down.",
  trendStrength: "ADX 26.2 = moderate trend, but DI+ and DI– are close, so the direction is not decisive.",
  movingAverages: [
    { name: "EMA 20", reading: "~22690", verdict: "sell", source: "estimated", note: "not plotted — averaged from the last 20 visible candles" },
    { name: "SMA 50", reading: "~22713", verdict: "sell", source: "estimated", note: "not plotted — averaged from the last 50 visible candles" },
    { name: "SMA 200", reading: "not enough candles", verdict: "unavailable", source: "not visible" },
  ],
  oscillators: [
    { name: "RSI (14)", reading: "51.8", verdict: "neutral", source: "read" },
    { name: "MACD (12,26,9)", reading: "no panel — judged from price action", verdict: "sell", source: "estimated" },
    { name: "Stochastic (14,3,3)", reading: "no panel — mid-range momentum", verdict: "neutral", source: "estimated" },
    { name: "ADX (14)", reading: "26.2", verdict: "neutral", source: "read" },
  ],
  priceAction: ["Lower highs since 22890.1", "Tight range between 22640 and 22770"],
  riskPlan: {
    idea: "Wait for the range to break before doing anything.",
    trigger: "A 15m close below 22640.5 opens 22489.2.",
    invalidation: "A 15m close above 22770 cancels the bearish idea.",
    target: "22489.2, then 22380",
    riskReward: "About 1.9 : 1 from the range edge",
  },
  notVisible: ["CCI (20)", "Williams %R (14)", "SMA 200 (too few candles visible)"],
  caveats: [
    "This is a demo sample so you can see the layout without an API key.",
    "Educational analysis only, not financial advice.",
  ],
};
