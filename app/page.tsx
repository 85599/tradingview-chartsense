"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnalysisView } from "@/components/AnalysisView";
import { ChatPanel } from "@/components/ChatPanel";
import { DropZone, type DroppedImage } from "@/components/DropZone";
import { HistoryRail } from "@/components/HistoryRail";
import { Logo, ProviderDots } from "@/components/Logo";
import { SettingsModal } from "@/components/SettingsModal";
import { api } from "@/lib/client";
import { fileToDataUrl } from "@/lib/image";
import { parseCandles } from "@/lib/indicators";
import type { MaskedSettings, HistoryEntry } from "@/lib/config";
import type { Analysis, ChatMessage, Provider } from "@/lib/types";

interface Result {
  analysis: Analysis;
  text: string;
  provider: Provider;
  model: string;
  demo: boolean;
  id?: string;
}

const MAX_IMAGES = 4;

function TradingViewMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <path d="M6 4v16" stroke="var(--color-buy)" />
      <rect x="4.2" y="8" width="3.6" height="7" rx="1" fill="var(--color-buy)" stroke="none" />
      <path d="M12 4v16" stroke="var(--color-sell)" />
      <rect x="10.2" y="6" width="3.6" height="8" rx="1" fill="var(--color-sell)" stroke="none" />
      <path d="M18 4v16" stroke="var(--color-accent)" />
      <rect x="16.2" y="11" width="3.6" height="6" rx="1" fill="var(--color-accent)" stroke="none" />
    </svg>
  );
}

const ICON = "h-[18px] w-[18px]";

const INFO_CARDS = [
  {
    title: "TradingView",
    body: "Price above an average is a buy for that average, below is a sell. Oscillators score oversold/overbought and crosses. ADX measures trend strength, DI+ versus DI- decides direction.",
    foot: "The gauge is the average of those signals — nothing else.",
    icon: (
      <svg viewBox="0 0 24 24" className={ICON} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M3 16l5-6 4 3 4-6 5 4" />
        <path d="M3 21h18" />
      </svg>
    ),
  },
  {
    title: "Confidence, not crystal ball",
    body: "The score starts at 50 and moves on ten visible factors: average and oscillator agreement, ADX strength, how close price sits to a tested level, freshness, chop, risk to reward, and how readable your screenshot is.",
    foot: "Clamped to 5-85. Never a probability of profit.",
    icon: (
      <svg viewBox="0 0 24 24" className={ICON} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 12l4.5-3.5" />
        <path d="M12 3.5v2M20.5 12h-2M12 20.5v-2M3.5 12h2" />
      </svg>
    ),
  },
  {
    title: "Calculated, read, or honestly estimated",
    body: "Paste candle data and the averages, RSI, MACD, Stochastic and ADX are calculated here and tagged 'calculated'. Indicator panels you switched on are read exactly. Missing averages are estimated from the price path with a ~ and an 'estimated' tag; missing oscillators get a verdict from price action, never a fake number.",
    foot: "So you always know where each number came from.",
    icon: (
      <svg viewBox="0 0 24 24" className={ICON} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M2.5 12s3.6-6.5 9.5-6.5S21.5 12 21.5 12 17.9 18.5 12 18.5 2.5 12 2.5 12z" />
        <circle cx="12" cy="12" r="2.6" />
      </svg>
    ),
  },
];

export default function Page() {
  const [images, setImages] = useState<DroppedImage[]>([]);
  const [hint, setHint] = useState("");
  const [marketData, setMarketData] = useState("");
  const [dataOpen, setDataOpen] = useState(false);
  const [language, setLanguage] = useState<"english" | "hinglish">("english");
  const [provider, setProvider] = useState<Provider | "auto">("auto");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [settings, setSettings] = useState<MaskedSettings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const studioRef = useRef<HTMLDivElement>(null);

  const refreshSettings = useCallback(() => {
    api("/api/settings")
      .then((response) => response.json())
      .then((data: MaskedSettings) => setSettings(data))
      .catch(() => setSettings(null));
  }, []);

  const refreshHistory = useCallback(() => {
    api("/api/history")
      .then((response) => response.json())
      .then((data: HistoryEntry[]) => setHistory(data))
      .catch(() => setHistory([]));
  }, []);

  useEffect(() => {
    refreshSettings();
    refreshHistory();
  }, [refreshSettings, refreshHistory]);

  const addFiles = useCallback(async (files: File[]) => {
    const pictureFiles = files.filter((file) => file.type.startsWith("image/"));
    if (pictureFiles.length === 0) return;
    setError("");
    try {
      const converted = await Promise.all(pictureFiles.map((file) => fileToDataUrl(file)));
      setImages((previous) => {
        const merged = [
          ...previous,
          ...converted.map((dataUrl, index) => ({
            id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
            name: pictureFiles[index].name || "clipboard.png",
            dataUrl,
          })),
        ];
        if (merged.length > MAX_IMAGES) setError(`Only the first ${MAX_IMAGES} charts were kept.`);
        return merged.slice(0, MAX_IMAGES);
      });
    } catch (cause) {
      setError((cause as Error).message);
    }
  }, []);

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length) {
        event.preventDefault();
        void addFiles(files);
        studioRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  async function runAnalysis() {
    if (images.length === 0) {
      setError("Drop a TradingView screenshot first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await api("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          images: images.map((image) => image.dataUrl),
          hint,
          marketData,
          language,
          provider: provider === "auto" ? undefined : provider,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Something went wrong while analysing.");
      } else {
        setResult(data);
        setMessages([]);
        refreshHistory();
      }
    } catch {
      setError("Could not reach the local server. Is `npm run dev` still running?");
    } finally {
      setBusy(false);
    }
  }

  async function sendChat(text: string) {
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setChatBusy(true);
    setError("");
    try {
      const response = await api("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: next,
          // The chart only needs to go up once — later turns reuse the stored analysis, so
          // the token cost of the conversation stays flat instead of growing every message.
          images: next.filter((message) => message.role === "user").length <= 1 ? images.map((image) => image.dataUrl) : [],
          analysis: result?.analysis ?? null,
          language,
          provider: provider === "auto" ? undefined : provider,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Chat failed.");
        setMessages(next.slice(0, -1));
        return;
      }
      setMessages([...next, { role: "assistant", content: data.reply }]);
    } catch {
      setError("Chat failed — the local server did not answer.");
      setMessages(next.slice(0, -1));
    } finally {
      setChatBusy(false);
    }
  }

  const candleCount = marketData.trim() ? parseCandles(marketData).length : 0;

  const configuredFlags = Object.fromEntries(
    Object.entries(settings?.providers ?? {}).map(([name, value]) => [name, value.configured])
  ) as Record<string, boolean>;

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="starfield" />
        <div className="hairlines" />
        <div className="glow-top" />
        <div className="glow-floor" style={{ bottom: "-560px" }} />
      </div>

      <header className="sticky top-0 z-30 border-b border-white/5 bg-black/45 backdrop-blur-xl">
        <div className="shell flex h-[62px] items-center justify-between gap-4">
          <Logo />
          <div className="hidden items-center gap-4 md:flex">
            <ProviderDots configured={configuredFlags} />
            <span className="text-[12.5px] text-muted">TradingView</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn btn-ghost !py-2" onClick={() => setSettingsOpen(true)}>
              {settings && Object.values(configuredFlags).some(Boolean) ? "Providers" : "Add API key"}
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        <section className="shell pt-14 pb-9 text-center">
          <span className="chip !py-1.5 !text-[12px]">
            New · screenshot → technical read <span className="text-accent">→</span>
          </span>
          <h1 className="headline mx-auto mt-5 max-w-[900px]">
            <span className="text-fade">Drop a Chart.</span>
            <br />
            <span className="text-fade">Get the </span>
            <span className="bg-gradient-to-r from-accent-soft to-accent bg-clip-text text-transparent">Read</span>
            <span className="text-fade">.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-[620px] text-[15.5px] leading-relaxed text-muted">
            Screenshot your TradingView chart, drag it in, and get a short plain-English technical analysis with support,
            resistance and a trade confidence score — using Grok, OpenAI, Gemini or OpenRouter.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
            <button
              className="btn btn-primary"
              onClick={() => studioRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              Analyse a screenshot
            </button>
            <button className="btn btn-ghost" onClick={() => setSettingsOpen(true)}>
              Connect AI keys
            </button>
          </div>
          <p className="mt-5 text-[12px] text-muted">Trusted indicator logic: MA + RSI + MACD + Stoch + ADX + CCI + Williams %R</p>
        </section>

        <section className="shell pb-10" ref={studioRef}>
          <div className="card p-4 sm:p-5">
            <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)_320px] xl:grid-cols-[210px_minmax(0,1fr)_370px]">
              <div className="order-3 flex flex-col gap-3 lg:sticky lg:top-[78px] lg:order-1 lg:self-start">
                <HistoryRail
                  entries={history}
                  activeId={result?.id}
                  onSelect={(entry) => {
                    setResult({
                      analysis: entry.analysis,
                      text: entry.text,
                      provider: entry.provider,
                      model: entry.model,
                      demo: entry.provider === "demo",
                      id: entry.id,
                    });
                    setMessages([]);
                  }}
                  onClear={async () => {
                    await api("/api/history", { method: "DELETE" });
                    refreshHistory();
                  }}
                />
                <div className="card-flat shrink-0 p-3">
                  <span className="label">How it works</span>
                  <ol className="mt-2 space-y-2 text-[11.5px] leading-relaxed text-muted">
                    <li>
                      <span className="font-semibold text-zinc-200">1.</span> Drop or paste the chart with its indicator
                      panel visible.
                    </li>
                    <li>
                      <span className="font-semibold text-zinc-200">2.</span> The model reads levels and indicators, then
                      scores them the TradingView way.
                    </li>
                    <li>
                      <span className="font-semibold text-zinc-200">3.</span> Ask follow-ups in chat — the same chart stays
                      in context.
                    </li>
                  </ol>
                </div>
              </div>

              <div className="order-1 min-w-0 space-y-3 lg:order-2">
                <DropZone
                  images={images}
                  onFiles={(files) => void addFiles(files)}
                  onRemove={(id) => setImages((previous) => previous.filter((image) => image.id !== id))}
                  busy={busy}
                />

                <div className="card-flat space-y-3 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="label mr-1">Engine</span>
                    {(["auto", "gemini", "grok", "openai", "openrouter", "demo"] as const).map((option) => (
                      <button
                        key={option}
                        onClick={() => setProvider(option)}
                        className={`rounded-full border px-2.5 py-1 text-[11.5px] font-semibold capitalize transition ${
                          provider === option
                            ? "border-accent/70 bg-accent/15 text-white"
                            : "border-line bg-white/[0.03] text-muted hover:border-white/25"
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                    <span className="ml-auto flex items-center gap-2">
                      <span className="label">Language</span>
                      <button
                        onClick={() => setLanguage(language === "english" ? "hinglish" : "english")}
                        className="rounded-full border border-line bg-white/[0.03] px-2.5 py-1 text-[11.5px] font-semibold text-zinc-200"
                      >
                        {language === "english" ? "Plain English" : "Hinglish"}
                      </button>
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={hint}
                      onChange={(event) => setHint(event.target.value)}
                      placeholder="Optional: NIFTY 50, 15m, intraday — helps the model label the chart"
                      className="field flex-1 !min-w-[240px] text-[13px]"
                    />
                    <button className="btn btn-primary" onClick={runAnalysis} disabled={busy || images.length === 0}>
                      {busy ? "Reading the chart…" : "Analyse chart"}
                    </button>
                  </div>

                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setDataOpen((open) => !open)}
                      className="flex flex-wrap items-center gap-2 text-[11.5px] font-semibold text-muted transition hover:text-zinc-200"
                    >
                      <span className={`inline-block transition ${dataOpen ? "rotate-90" : ""}`}>▸</span>
                      Paste candle data for exact indicators
                      {candleCount > 0 && (
                        <span className="chip border-buy/30 bg-buy/10 text-buy">{candleCount} candles · will be computed</span>
                      )}
                    </button>
                    {dataOpen && (
                      <>
                        <textarea
                          value={marketData}
                          onChange={(event) => setMarketData(event.target.value.slice(0, 40_000))}
                          placeholder={"One row per candle, oldest first:\n2026-10-20 09:15,22610.05,22655.40,22598.20,22648.90,182340\nTradingView chart menu → Export data (CSV), or just copy the rows."}
                          className="field h-28 w-full resize-y font-mono text-[11.5px] leading-relaxed"
                        />
                        <p className="text-[11px] leading-relaxed text-muted">
                          Real closes let the server calculate SMA/EMA/RSI/MACD/Stochastic/ADX exactly and tag them
                          <span className="text-zinc-200"> computed</span> instead of estimated. Needs 200+ rows for an SMA 200.
                        </p>
                      </>
                    )}
                  </div>

                  {busy && (
                    <div className="flex items-center gap-2 text-[12px] text-muted">
                      <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-accent" />
                      Vision model is reading your indicator panel. Usually 10-40 seconds.
                    </div>
                  )}
                  {error && (
                    <p className="rounded-lg border border-sell/30 bg-sell/10 px-3 py-2 text-[12.5px] text-[#ffb3a8]">
                      {error}
                    </p>
                  )}
                </div>

                {result ? (
                  <AnalysisView
                    analysis={result.analysis}
                    text={result.text}
                    meta={{ provider: result.provider, model: result.model, demo: result.demo }}
                  />
                ) : (
                  <div className="card flex flex-col items-center justify-center gap-2 p-10 text-center">
                    <span className="text-[13.5px] font-semibold text-zinc-200">No analysis yet</span>
                    <span className="max-w-[380px] text-[12.5px] text-muted">
                      Drop a TradingView screenshot above and hit Analyse. Without an API key you get a demo read so you can
                      see the layout.
                    </span>
                  </div>
                )}
              </div>

              <div className="order-2 lg:order-3">
                <ChatPanel
                  messages={messages}
                  busy={chatBusy}
                  disabled={!result && images.length === 0}
                  onSend={(text) => void sendChat(text)}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="shell pb-12">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
            <div>
              <span className="label">Under the hood</span>
              <h2 className="mt-1.5 text-[20px] font-bold tracking-tight">Three rules this tool never breaks</h2>
            </div>
            <p className="max-w-[440px] text-[12.5px] leading-relaxed text-muted">
              Every number is calculated from your price data, read straight off the screenshot, or clearly marked as
              estimated. Nothing is invented to make a read look complete.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {INFO_CARDS.map((item) => (
              <div key={item.title} className="card group relative flex flex-col overflow-hidden p-4">
                <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent opacity-40 transition group-hover:opacity-100" />
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-accent/25 bg-accent/10 text-accent">
                  {item.icon}
                </span>
                <h3 className="mt-3 text-[14px] font-bold tracking-tight">{item.title}</h3>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{item.body}</p>
                <span className="mt-auto pt-3 text-[11px] text-zinc-500">{item.foot}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="shell pb-14">
          <a
            href="https://in.tradingview.com/u/khushaljain023/"
            target="_blank"
            rel="noreferrer"
            className="card relative flex flex-wrap items-center gap-4 overflow-hidden p-4 transition hover:border-accent/40 sm:p-5"
          >
            <span className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-line bg-black/50">
              <TradingViewMark />
            </span>
            <div className="min-w-[220px] flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15.5px] font-bold tracking-tight">@khushaljain023</span>
                <span className="chip border-accent/30 bg-accent/10 text-accent-soft">TradingView profile</span>
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                Built by the trader behind these charts — ideas, levels and intraday structure published openly on
                TradingView.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip">3.5K followers</span>
              <span className="chip">42 ideas</span>
              <span className="btn btn-ghost py-2 text-[13px]">Follow on TradingView ↗</span>
            </div>
          </a>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/5 py-6">
        <div className="shell flex flex-wrap items-center justify-between gap-3 text-[11.5px] text-muted">
          <span>ChartSense · runs locally on your machine · keys stay local</span>
          <span className="flex items-center gap-3">
            <a href="https://in.tradingview.com/u/khushaljain023/" target="_blank" rel="noreferrer" className="hover:text-accent-soft">
              @khushaljain023
            </a>
            <span>Educational analysis only. Not investment advice.</span>
          </span>
        </div>
      </footer>

      <SettingsModal open={settingsOpen} onClose={() => { setSettingsOpen(false); refreshSettings(); }} />
    </div>
  );
}
