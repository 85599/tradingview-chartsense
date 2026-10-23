"use client";

import { useEffect, useState } from "react";
import { api, getAccessToken, setAccessToken } from "@/lib/client";
import type { MaskedSettings } from "@/lib/config";
import type { ModelOption } from "@/lib/ai";
import type { Provider } from "@/lib/types";

const PROVIDERS: { id: Exclude<Provider, "demo">; label: string; keyUrl: string; note: string }[] = [
  { id: "grok", label: "Grok (xAI)", keyUrl: "https://console.x.ai", note: "Vision-capable Grok chat model" },
  { id: "openai", label: "OpenAI", keyUrl: "https://platform.openai.com/api-keys", note: "GPT with image input" },
  { id: "gemini", label: "Gemini (Google)", keyUrl: "https://aistudio.google.com/apikey", note: "Free tier works well for images" },
  { id: "openrouter", label: "OpenRouter", keyUrl: "https://openrouter.ai/settings/keys", note: "One key for Grok / GPT / Gemini models" },
];

const BLANK = { grok: "", openai: "", gemini: "", openrouter: "" };

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [settings, setSettings] = useState<MaskedSettings | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({ ...BLANK });
  const [models, setModels] = useState<Record<string, string>>({ ...BLANK });
  const [modelOptions, setModelOptions] = useState<Record<string, ModelOption[]>>({});
  const [defaultProvider, setDefaultProvider] = useState<Provider>("gemini");
  const [status, setStatus] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState("");

  useEffect(() => {
    if (!open) return;
    setToken(getAccessToken());
    void (async () => {
      const data = (await api("/api/settings").then((response) => response.json())) as MaskedSettings;
      setSettings(data);
      setDefaultProvider(data.defaultProvider);
      setModels({ ...BLANK });
      setModelOptions({});
      setStatus({});
    })();
  }, [open]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && open) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function save() {
    setBusy(true);
    setStatus({});
    const providers: Record<string, { apiKey: string; model: string }> = {};
    for (const provider of PROVIDERS) {
      providers[provider.id] = { apiKey: keys[provider.id], model: models[provider.id] };
    }
    const response = await api("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ defaultProvider, providers }),
    });
    const data = await response.json();
    if (!response.ok || !data.providers) {
      setStatus({ save: data.error ?? "Could not save — the server refused the request." });
      setBusy(false);
      return;
    }
    setSettings(data as MaskedSettings);
    setKeys({ ...BLANK });
    setStatus({ save: "Saved in your private data folder on this computer." });
    setBusy(false);
  }

  async function saveToken() {
    setAccessToken(token.trim());
    setStatus({ token: token.trim() ? "Token kept in this browser for future calls." : "Token cleared." });
  }

  async function test(provider: Exclude<Provider, "demo">) {
    setBusy(true);
    setStatus((prev) => ({ ...prev, [provider]: "Testing…" }));
    const response = await api("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "test", provider, apiKey: keys[provider], model: models[provider] }),
    });
    const data = await response.json();
    setStatus((prev) => ({ ...prev, [provider]: data.message ?? data.error ?? "Failed" }));
    if (data.ok) {
      const refreshed = (await api("/api/settings").then((res) => res.json())) as MaskedSettings;
      setSettings(refreshed);
    }
    setBusy(false);
  }

  async function fetchModels(provider: Exclude<Provider, "demo">) {
    setBusy(true);
    setStatus((prev) => ({ ...prev, [provider]: "Loading models…" }));
    const response = await api("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "models", provider, apiKey: keys[provider] }),
    });
    const data = await response.json();
    if (data.ok) {
      setModelOptions((prev) => ({ ...prev, [provider]: data.models }));
      setStatus((prev) => ({ ...prev, [provider]: `${data.models.length} image-capable models loaded — type in the model box to filter. Use Test key to check your own key.` }));
    } else {
      setStatus((prev) => ({ ...prev, [provider]: data.message ?? data.error ?? "Failed" }));
    }
    setBusy(false);
  }

  async function clearKey(provider: Exclude<Provider, "demo">) {
    setBusy(true);
    const response = await api("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "clearKey", provider }),
    });
    const data = await response.json();
    if (data.providers) setSettings(data as MaskedSettings);
    setStatus((prev) => ({ ...prev, [provider]: data.providers ? "Key removed." : data.error ?? "Failed" }));
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm">
      <div className="card my-8 w-full max-w-[720px] p-5">
        <div className="mb-1 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[17px] font-bold tracking-tight">Connect an AI provider</h2>
            <p className="text-[12.5px] text-muted">
              Keys are saved outside the project folder, in{" "}
              <code className="rounded bg-white/10 px-1">{settings?.dataPath ?? "your private data folder"}</code>, and only
              ever sent to that provider&apos;s API. Env vars work too: XAI_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY.
            </p>
          </div>
          <button className="btn btn-ghost !px-3 !py-1.5" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {PROVIDERS.map((provider) => {
            const info = settings?.providers[provider.id];
            return (
              <div key={provider.id} className="card-flat p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: info?.configured ? "var(--color-buy)" : "rgba(255,255,255,0.2)" }}
                    />
                    <span className="text-[13.5px] font-semibold">{provider.label}</span>
                    <span className="text-[11px] text-muted">{provider.note}</span>
                  </div>
                  <label className="flex items-center gap-1.5 text-[11.5px] text-muted">
                    <input
                      type="radio"
                      name="defaultProvider"
                      checked={defaultProvider === provider.id}
                      onChange={() => setDefaultProvider(provider.id)}
                      className="accent-[#ff7a2f]"
                    />
                    preferred
                  </label>
                </div>

                <div className="mt-2.5 grid gap-2 sm:grid-cols-[1fr_170px]">
                  <input
                    type="password"
                    value={keys[provider.id]}
                    onChange={(event) => setKeys((prev) => ({ ...prev, [provider.id]: event.target.value }))}
                    placeholder={info?.configured ? `Saved ${info.maskedKey} — paste a new key to replace` : "Paste API key"}
                    className="field font-mono text-[12.5px]"
                    autoComplete="off"
                  />
                  <input
                    value={models[provider.id]}
                    list={`model-list-${provider.id}`}
                    onChange={(event) => setModels((prev) => ({ ...prev, [provider.id]: event.target.value }))}
                    placeholder={info?.model ? `auto: ${info.model}` : "model (optional)"}
                    className="field font-mono text-[12.5px]"
                  />
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button className="btn btn-ghost !py-1.5 !text-[12px]" onClick={() => test(provider.id)} disabled={busy}>
                    Test key
                  </button>
                  <button className="btn btn-ghost !py-1.5 !text-[12px]" onClick={() => fetchModels(provider.id)} disabled={busy}>
                    List vision models
                  </button>
                  {info?.configured ? (
                    <button className="btn btn-ghost !py-1.5 !text-[12px]" onClick={() => clearKey(provider.id)} disabled={busy}>
                      Remove key
                    </button>
                  ) : null}
                  <a
                    className="text-[11.5px] text-accent-soft hover:underline"
                    href={provider.keyUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Get a key ↗
                  </a>
                  {status[provider.id] ? <span className="text-[11.5px] text-muted">{status[provider.id]}</span> : null}
                </div>

                {modelOptions[provider.id]?.length ? (
                  <datalist id={`model-list-${provider.id}`}>
                    {modelOptions[provider.id].map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </datalist>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="mt-4 card-flat p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-[13px] font-semibold">Public deployment token</span>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">
                Running on localhost needs nothing here. If you serve ChartSense from a public host, set
                <code className="mx-1 rounded bg-white/10 px-1">CHARTSENSE_ACCESS_TOKEN</code>
                on the server and paste the same value below — without it every API route answers 403.
              </p>
            </div>
            <span className={`chip ${settings?.locked ? "border-buy/30 bg-buy/10 text-buy" : ""}`}>
              {settings?.locked ? "server is locked" : "local-only"}
            </span>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Access token from the server environment"
              className="field flex-1 !min-w-[220px] font-mono text-[12.5px]"
              autoComplete="off"
            />
            <button className="btn btn-ghost !py-1.5 !text-[12px]" onClick={() => void saveToken()} disabled={busy}>
              Remember token
            </button>
            {status.token ? <span className="text-[11.5px] text-muted">{status.token}</span> : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
          <p className="mr-auto text-[11.5px] text-muted">
            With no keys saved the app runs in demo mode so you can explore the layout.
          </p>
          <div className="flex items-center gap-2">
            {status.save ? <span className="text-[12px] text-buy">{status.save}</span> : null}
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              Save keys
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
