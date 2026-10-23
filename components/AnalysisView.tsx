"use client";

import { useState } from "react";
import { ConfidenceRing, Gauge, TonePill } from "./Gauge";
import type { Analysis, SignalItem } from "@/lib/types";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="card-flat p-4">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h3 className="shrink-0 text-[13px] font-bold tracking-tight">{title}</h3>
        {hint ? <span className="truncate text-[11px] text-muted">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

const SOURCE_TAGS: Record<SignalItem["source"], { label: string; color: string } | null> = {
  read: null,
  computed: { label: "calculated", color: "var(--color-buy)" },
  estimated: { label: "estimated", color: "var(--color-accent)" },
  "not visible": { label: "no basis", color: "#6f6f76" },
};

function SourceTag({ source }: { source: SignalItem["source"] }) {
  const tag = SOURCE_TAGS[source] ?? null;
  if (!tag) return null;
  return (
    <span className="ml-1.5 rounded px-1 py-px text-[9.5px] font-bold uppercase tracking-wide" style={{ color: tag.color, background: `${tag.color}1a` }}>
      {tag.label}
    </span>
  );
}

function SignalRow({ item }: { item: SignalItem }) {
  // "Not visible" already says what the "no basis" tag would say, so showing both is noise.
  const showTag = !(item.source === "not visible" && item.verdict === "unavailable");
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 py-1.5 last:border-0">
      <div className="min-w-0">
        <div className="truncate text-[12.5px] font-medium text-zinc-200">
          {item.name}
          {showTag ? <SourceTag source={item.source} /> : null}
        </div>
        <div className="line-clamp-2 text-[11px] leading-snug text-muted">
          {item.reading}
          {item.note ? ` · ${item.note}` : ""}
        </div>
      </div>
      <TonePill tone={item.verdict} />
    </div>
  );
}

function LevelList({ label, levels, color }: { label: string; levels: string[]; color: string }) {
  return (
    <div>
      <div className="label mb-1.5" style={{ color }}>
        {label}
      </div>
      {levels.length === 0 ? (
        <div className="text-[12.5px] text-muted">Not readable from this screenshot</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {levels.map((level, index) => (
            <span
              key={level + index}
              className="rounded-md px-2 py-1 font-mono text-[12.5px] font-semibold"
              style={{ color, background: `${color}14`, border: `1px solid ${color}2e` }}
            >
              {level}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function AnalysisView({
  analysis,
  text,
  meta,
}: {
  analysis: Analysis;
  text: string;
  meta: { provider: string; model: string; demo: boolean };
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  function download() {
    const slug = `${analysis.instrument}-${analysis.timeframe}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `chartsense-${slug}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const buySignals = [...analysis.movingAverages, ...analysis.oscillators].filter((item) => item.verdict === "buy").length;
  const sellSignals = [...analysis.movingAverages, ...analysis.oscillators].filter((item) => item.verdict === "sell").length;

  return (
    <div className="space-y-3">
      <div className="card p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-[220px] flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[19px] font-bold tracking-tight">{analysis.instrument}</span>
              <span className="chip">{analysis.timeframe}</span>
              <span className="chip">LTP {analysis.lastPrice}</span>
              {meta.demo ? <span className="chip" style={{ color: "var(--color-flat)" }}>demo data</span> : null}
            </div>
            <p className="mt-2.5 text-[13.5px] leading-relaxed text-zinc-300">{analysis.summary}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <span className="chip">{meta.provider} · {meta.model}</span>
              <span className="chip">{buySignals} buy signals</span>
              <span className="chip">{sellSignals} sell signals</span>
            </div>
          </div>
          <Gauge index={analysis.gaugeIndex} verdict={analysis.verdict} />
          <ConfidenceRing value={analysis.confidence} reason={analysis.confidenceReason} />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Section title="Key Levels" hint="from this chart only">
          <div className="space-y-3">
            <LevelList label="Support" levels={analysis.support} color="var(--color-buy)" />
            <LevelList label="Resistance" levels={analysis.resistance} color="var(--color-sell)" />
          </div>
        </Section>

        <Section title="Outlook" hint="if-then, no predictions">
          <p className="text-[13px] leading-relaxed text-zinc-300">{analysis.outlook}</p>
          <p className="mt-2.5 text-[12px] leading-relaxed text-muted">{analysis.trendStrength}</p>
        </Section>
      </div>

      {analysis.confidenceFactors.length > 0 && (
        <Section title="Why this confidence score" hint={`base 50 → ${analysis.confidence}`}>
          <ul className="space-y-2">
            {analysis.confidenceFactors.map((factor, index) => {
              const color = factor.points > 0 ? "var(--color-buy)" : factor.points < 0 ? "var(--color-sell)" : "#6f6f76";
              return (
                <li key={factor.label + index} className="flex items-start gap-2.5">
                  <span
                    className="mt-px w-[38px] shrink-0 rounded px-1 py-0.5 text-center font-mono text-[11px] font-bold"
                    style={{ color, background: `${color}14`, border: `1px solid ${color}2e` }}
                  >
                    {factor.points > 0 ? `+${factor.points}` : factor.points}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-medium text-zinc-200">{factor.label}</div>
                    <div className="text-[11.5px] leading-relaxed text-muted">{factor.reason}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <Section title="Moving Averages" hint={`price above = buy, below = sell`}>
          {analysis.movingAverages.length ? (
            analysis.movingAverages.map((item, index) => <SignalRow key={item.name + index} item={item} />)
          ) : (
            <p className="text-[12.5px] text-muted">No moving averages were readable in the screenshot.</p>
          )}
        </Section>
        <Section title="Oscillators" hint="RSI, MACD, Stoch, ADX, CCI…">
          {analysis.oscillators.length ? (
            analysis.oscillators.map((item, index) => <SignalRow key={item.name + index} item={item} />)
          ) : (
            <p className="text-[12.5px] text-muted">No oscillator panel was readable in the screenshot.</p>
          )}
        </Section>
      </div>

      {analysis.priceAction.length > 0 && (
        <Section title="Price action visible">
          <ul className="space-y-1.5">
            {analysis.priceAction.map((item, index) => (
              <li key={item + index} className="flex gap-2 text-[13px] text-zinc-300">
                <span className="text-accent">▸</span>
                {item}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {analysis.riskPlan && (
        <Section title="If-then plan" hint="educational, not advice">
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ["Idea", analysis.riskPlan.idea],
              ["Trigger", analysis.riskPlan.trigger],
              ["Invalidation", analysis.riskPlan.invalidation],
              ["Target", analysis.riskPlan.target],
              ["Risk : reward", analysis.riskPlan.riskReward],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-black/30 p-2.5">
                <div className="label mb-0.5">{label}</div>
                <div className="text-[12.5px] text-zinc-200">{value || "—"}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {(analysis.notVisible.length > 0 || analysis.caveats.length > 0) && (
        <Section title="Honest limits">
          {analysis.notVisible.length > 0 && (
            <p className="text-[12.5px] text-muted">
              <span className="font-semibold text-zinc-300">Not visible in the screenshot:</span>{" "}
              {analysis.notVisible.join(", ")}
            </p>
          )}
          {analysis.caveats.map((item, index) => (
            <p key={item + index} className="mt-1.5 text-[12.5px] text-muted">
              • {item}
            </p>
          ))}
        </Section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-ghost" onClick={copy}>
          {copied ? "Copied ✓" : "Copy as plain English text"}
        </button>
        <button className="btn btn-ghost" onClick={download}>
          Download .txt
        </button>
        <span className="text-[11.5px] text-muted">
          Educational technical read only. Not investment advice. Always wait for price confirmation.
        </span>
      </div>
    </div>
  );
}
