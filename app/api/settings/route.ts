import { NextResponse } from "next/server";
import { getMaskedSettings, getRawKey, saveSettings } from "@/lib/config";
import { listModels, pingProvider, ProviderError } from "@/lib/ai";
import { accessDenied, tooManyRequests } from "@/lib/guard";
import {
  BadRequest,
  parseApiKey,
  parseKeyProvider,
  parseModelName,
  parseProvider,
  readJson,
} from "@/lib/request";
import type { AppConfig } from "@/lib/config";
import type { Provider } from "@/lib/types";

export const runtime = "nodejs";

function messageOf(error: unknown): string {
  return error instanceof ProviderError ? error.message : (error as Error).message;
}

function denied(request: Request, limit: number): NextResponse | null {
  return accessDenied(request) ?? tooManyRequests(request, "settings", limit);
}

export async function GET(request: Request) {
  const blocked = denied(request, 30);
  if (blocked) return blocked;
  return NextResponse.json(await getMaskedSettings());
}

export async function POST(request: Request) {
  const blocked = denied(request, 20);
  if (blocked) return blocked;

  try {
    const body = await readJson(request);
    const provider = parseKeyProvider(body?.provider);

    if (body?.action === "test" || body?.action === "models") {
      if (!provider) return NextResponse.json({ error: "Unknown provider." }, { status: 400 });
      const apiKey = parseApiKey(body.apiKey) ?? (await getRawKey(provider));
      if (!apiKey) return NextResponse.json({ error: "No API key saved for this provider yet." }, { status: 400 });

      try {
        if (body.action === "models") {
          const models = await listModels(provider, apiKey);
          return NextResponse.json({ ok: true, models });
        }
        const model = await pingProvider(provider, apiKey, parseModelName(body.model) ?? "");
        return NextResponse.json({ ok: true, model, message: `Key works. Using ${model}.` });
      } catch (error) {
        return NextResponse.json({ ok: false, message: messageOf(error) }, { status: 502 });
      }
    }

    if (body?.action === "clearKey") {
      if (!provider) return NextResponse.json({ error: "Unknown provider." }, { status: 400 });
      await saveSettings({ clearKey: provider });
      return NextResponse.json(await getMaskedSettings());
    }

    const defaultProvider = parseProvider(body?.defaultProvider);
    const patch: Partial<AppConfig> = {};
    if (defaultProvider) patch.defaultProvider = defaultProvider as Provider;
    if (body?.providers && typeof body.providers === "object") {
      patch.providers = {} as AppConfig["providers"];
      for (const [name, value] of Object.entries(body.providers as Record<string, any>)) {
        const key = parseKeyProvider(name);
        if (!key || !value || typeof value !== "object") continue;
        const apiKey = parseApiKey(value.apiKey);
        const model = parseModelName(value.model);
        // Only send what the client actually changed: a blank field means "keep what is saved",
        // so saving one provider can never wipe another provider's stored key or model.
        const entry: Partial<AppConfig["providers"][typeof key]> = {};
        if (apiKey !== undefined) entry.apiKey = apiKey;
        if (model) entry.model = model;
        if (Object.keys(entry).length) patch.providers[key] = entry as AppConfig["providers"][typeof key];
      }
    }
    await saveSettings(patch);
    return NextResponse.json(await getMaskedSettings());
  } catch (error) {
    if (error instanceof BadRequest) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
