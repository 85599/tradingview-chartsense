import { promises as fs } from "fs";
import os from "os";
import path from "path";
import type { Analysis, Provider, Verdict } from "./types";

/**
 * Keys and history deliberately live outside the project folder, so copying, zipping or
 * publishing the source can never carry a live API key with it.
 */
const DATA_DIR = process.env.CHARTSENSE_DATA_DIR?.trim()
  ? path.resolve(process.env.CHARTSENSE_DATA_DIR.trim())
  : path.join(os.homedir(), ".chartsense");
// Only read once, to move an old in-project .data folder out of the way. The ignore comment stops
// the bundler from tracing (and shipping) the whole project directory because of this call.
const LEGACY_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), ".data");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");

const DATA_FILES = ["config.json", "history.json"] as const;
let prepared = false;

async function dataDir(): Promise<string> {
  if (!prepared) {
    await fs.mkdir(DATA_DIR, { recursive: true });
    for (const name of DATA_FILES) {
      const target = path.join(/* turbopackIgnore: true */ DATA_DIR, name);
      const legacy = path.join(/* turbopackIgnore: true */ LEGACY_DIR, name);
      try {
        await fs.access(target);
        continue;
      } catch {
        /* not there yet — try to migrate */
      }
      try {
        const source = await fs.readFile(legacy);
        await fs.writeFile(target, source);
        const written = await fs.readFile(target);
        if (written.length === source.length) await fs.unlink(legacy);
      } catch {
        /* nothing to migrate */
      }
    }
    prepared = true;
  }
  return DATA_DIR;
}

export interface ProviderSettings {
  apiKey: string;
  model: string;
}

export interface AppConfig {
  providers: Record<Exclude<Provider, "demo">, ProviderSettings>;
  defaultProvider: Provider;
}

export const MODEL_CANDIDATES: Record<Exclude<Provider, "demo">, string[]> = {
  openai: ["gpt-5.2", "gpt-5.1", "gpt-5", "gpt-4.1", "gpt-4o"],
  grok: ["grok-4.7", "grok-4", "grok-4-fast", "grok-2-vision-1212"],
  gemini: ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"],
  openrouter: ["x-ai/grok-4.7", "google/gemini-3.8-flash", "openai/gpt-5.2", "x-ai/grok-4.3"],
};

const ENV_KEYS: Record<Exclude<Provider, "demo">, string[]> = {
  openai: ["OPENAI_API_KEY"],
  grok: ["XAI_API_KEY", "GROK_API_KEY"],
  gemini: ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
  openrouter: ["OPENROUTER_API_KEY"],
};

const EMPTY: AppConfig = {
  providers: {
    openai: { apiKey: "", model: "" },
    grok: { apiKey: "", model: "" },
    gemini: { apiKey: "", model: "" },
    openrouter: { apiKey: "", model: "" },
  },
  defaultProvider: "grok",
};

async function readConfig(): Promise<AppConfig> {
  await dataDir();
  try {
    const raw = await fs.readFile(CONFIG_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    return {
      providers: { ...structuredClone(EMPTY.providers), ...(parsed.providers ?? {}) },
      defaultProvider: parsed.defaultProvider ?? EMPTY.defaultProvider,
    };
  } catch {
    return structuredClone(EMPTY);
  }
}

async function writeConfig(config: AppConfig): Promise<void> {
  await dataDir();
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
}

function envKey(provider: Exclude<Provider, "demo">): string {
  for (const name of ENV_KEYS[provider]) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

export async function resolveProvider(
  requested?: Provider
): Promise<{ provider: Provider; apiKey: string; model: string; candidates: string[] }> {
  const config = await readConfig();
  const order: Provider[] = requested
    ? [requested, config.defaultProvider, "gemini", "grok", "openai", "openrouter", "demo"]
    : [config.defaultProvider, "gemini", "grok", "openai", "openrouter", "demo"];

  for (const candidate of order) {
    if (candidate === "demo") return { provider: "demo", apiKey: "", model: "demo", candidates: [] };
    const saved = config.providers[candidate];
    const apiKey = saved?.apiKey?.trim() || envKey(candidate);
    if (!apiKey) continue;
    const model = saved?.model?.trim() || "";
    return {
      provider: candidate,
      apiKey,
      model,
      candidates: model ? [model, ...MODEL_CANDIDATES[candidate].filter((m) => m !== model)] : MODEL_CANDIDATES[candidate],
    };
  }
  return { provider: "demo", apiKey: "", model: "demo", candidates: [] };
}

export async function getRawKey(provider: Exclude<Provider, "demo">): Promise<string> {
  const config = await readConfig();
  return config.providers[provider].apiKey?.trim() || envKey(provider);
}

export async function rememberModel(
  provider: Provider,
  model: string,
  options?: { force?: boolean }
): Promise<void> {
  if (provider === "demo" || !model) return;
  const config = await readConfig();
  const current = config.providers[provider].model?.trim();
  // A 503 on the best model must not permanently downgrade the stored preference to a weaker fallback.
  if (current && !options?.force && rank(provider, current) <= rank(provider, model)) return;
  config.providers[provider].model = model;
  await writeConfig(config);
}

function rank(provider: Exclude<Provider, "demo">, model: string): number {
  const index = MODEL_CANDIDATES[provider].indexOf(model);
  return index === -1 ? MODEL_CANDIDATES[provider].length + 1 : index;
}

export interface MaskedSettings {
  defaultProvider: Provider;
  dataPath: string;
  locked: boolean;
  providers: Record<Provider, { configured: boolean; model: string; maskedKey: string }>;
}

export async function getMaskedSettings(): Promise<MaskedSettings> {
  const config = await readConfig();
  const build = (provider: Exclude<Provider, "demo">) => {
    const key = config.providers[provider].apiKey?.trim() || envKey(provider);
    return {
      configured: Boolean(key),
      model: config.providers[provider].model ?? "",
      maskedKey: key ? `${key.slice(0, 4)}…${key.slice(-4)}` : "",
    };
  };
  return {
    defaultProvider: config.defaultProvider,
    dataPath: DATA_DIR,
    locked: Boolean(process.env.CHARTSENSE_ACCESS_TOKEN?.trim()),
    providers: {
      demo: { configured: true, model: "demo", maskedKey: "no key needed" },
      grok: build("grok"),
      openai: build("openai"),
      gemini: build("gemini"),
      openrouter: build("openrouter"),
    },
  };
}

export async function saveSettings(patch: Partial<AppConfig> & { clearKey?: Provider }): Promise<void> {
  const config = await readConfig();
  if (patch.defaultProvider) config.defaultProvider = patch.defaultProvider;
  if (patch.providers) {
    for (const [name, value] of Object.entries(patch.providers)) {
      const key = name as Exclude<Provider, "demo">;
      const settings = value as ProviderSettings;
      config.providers[key] = {
        apiKey: settings.apiKey?.trim() ? settings.apiKey.trim() : config.providers[key].apiKey,
        model: settings.model?.trim() !== undefined ? settings.model.trim() : config.providers[key].model,
      };
    }
  }
  if (patch.clearKey && patch.clearKey !== "demo") {
    config.providers[patch.clearKey].apiKey = "";
    config.providers[patch.clearKey].model = "";
  }
  await writeConfig(config);
}

export interface HistoryEntry {
  id: string;
  createdAt: string;
  provider: Provider;
  model: string;
  instrument: string;
  timeframe: string;
  verdict: Verdict;
  confidence: number;
  analysis: Analysis;
  text: string;
}

const HISTORY_FILE = path.join(DATA_DIR, "history.json");

export async function listHistory(): Promise<HistoryEntry[]> {
  await dataDir();
  try {
    return JSON.parse(await fs.readFile(HISTORY_FILE, "utf8")) as HistoryEntry[];
  } catch {
    return [];
  }
}

export async function addHistory(entry: HistoryEntry): Promise<void> {
  const items = await listHistory();
  items.unshift(entry);
  await fs.writeFile(HISTORY_FILE, JSON.stringify(items.slice(0, 40), null, 2), "utf8");
}

export async function clearHistory(): Promise<void> {
  await dataDir();
  await fs.writeFile(HISTORY_FILE, "[]", "utf8");
}
