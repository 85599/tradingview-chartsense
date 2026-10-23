import type { Analysis, Provider } from "./types";

export const MAX_BODY_BYTES = 24_000_000;
export const MAX_IMAGES = 4;
/** base64 grows ~4/3, so this caps an uploaded screenshot at roughly 4.5 MB. */
export const MAX_IMAGE_CHARS = 6_000_000;
export const MAX_HINT_CHARS = 400;
export const MAX_MESSAGE_CHARS = 4_000;
export const MAX_DATA_CHARS = 40_000;
export const MAX_ANALYSIS_CHARS = 24_000;
export const MAX_KEY_CHARS = 300;
export const MAX_MODEL_CHARS = 80;

const PROVIDERS = new Set<Provider>(["grok", "openai", "gemini", "openrouter", "demo"]);
const KEY_PROVIDERS = new Set<Exclude<Provider, "demo">>(["grok", "openai", "gemini", "openrouter"]);
const IMAGE_TYPE = /^data:image\/(png|jpe?g|webp|heic|heif);base64,[a-z0-9+/=]+$/i;

export class BadRequest extends Error {}

export async function readJson(request: Request): Promise<any> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) throw new BadRequest(`Request is too large (${Math.round(MAX_BODY_BYTES / 1_000_000)} MB max).`);
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new BadRequest("Request body is too large.");
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    return parsed;
  } catch {
    throw new BadRequest("Could not read the request body as JSON.");
  }
}

export function parseImages(value: unknown, label = "screenshot"): string[] {
  if (!Array.isArray(value)) return [];
  const images = value
    .filter((item): item is string => typeof item === "string" && IMAGE_TYPE.test(item))
    .slice(0, MAX_IMAGES);
  if (images.some((image) => image.length > MAX_IMAGE_CHARS)) {
    throw new BadRequest(`One of the ${label} images is too large. Try a smaller screenshot.`);
  }
  return images;
}

export function parseProvider(value: unknown): Provider | undefined {
  return typeof value === "string" && PROVIDERS.has(value as Provider) ? (value as Provider) : undefined;
}

/** Providers that can hold an API key — `demo` is deliberately excluded. */
export function parseKeyProvider(value: unknown): Exclude<Provider, "demo"> | null {
  return typeof value === "string" && KEY_PROVIDERS.has(value as Exclude<Provider, "demo">)
    ? (value as Exclude<Provider, "demo">)
    : null;
}

export function parseLanguage(value: unknown): "english" | "hinglish" {
  return value === "hinglish" ? "hinglish" : "english";
}

export function parseText(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

export function parseApiKey(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const key = value.trim();
  if (key.length > MAX_KEY_CHARS || /\s/.test(key)) throw new BadRequest("That does not look like a valid API key.");
  return key;
}

export function parseModelName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (value.length > MAX_MODEL_CHARS || /[\r\n]/.test(value)) throw new BadRequest("Model names have to stay under 80 characters.");
  return value.trim();
}

/** The saved analysis is echoed back into the chat system prompt, so it has to stay small and shaped. */
export function parseAnalysis(value: unknown): Analysis | null {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequest("The saved analysis is not a valid object.");
  if (JSON.stringify(value).length > MAX_ANALYSIS_CHARS) throw new BadRequest("The saved analysis is too large — run the analysis again.");
  const analysis = value as Analysis;
  const verdicts = new Set(["strong_buy", "buy", "neutral", "sell", "strong_sell"]);
  return {
    ...analysis,
    verdict: verdicts.has(analysis.verdict) ? analysis.verdict : "neutral",
    gaugeIndex: clamp(analysis.gaugeIndex, 0, 100, 50),
    confidence: clamp(analysis.confidence, 5, 85, 40),
  };
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}

export function parseChatMessages(value: unknown): { role: "user" | "assistant"; content: string }[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item: any) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string" && item.content.trim()
    )
    .map((item: any) => ({ role: item.role, content: String(item.content).slice(0, MAX_MESSAGE_CHARS) }))
    .slice(-8);
}
