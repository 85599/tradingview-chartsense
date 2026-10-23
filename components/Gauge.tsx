"use client";

import type { Verdict } from "@/lib/types";
import { VERDICT_LABEL } from "@/lib/format";

const VERDICT_COLOR: Record<Verdict, string> = {
  strong_buy: "var(--color-buy)",
  buy: "var(--color-buy)",
  neutral: "var(--color-flat)",
  sell: "var(--color-sell)",
  strong_sell: "var(--color-sell)",
};

function polar(angle: number, radius: number) {
  const radians = ((angle - 180) * Math.PI) / 180;
  return { x: 100 + radius * Math.cos(radians), y: 100 + radius * Math.sin(radians) };
}

function arc(from: number, to: number, radius: number) {
  const start = polar(from, radius);
  const end = polar(to, radius);
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 1 ${end.x} ${end.y}`;
}

export function Gauge({ index, verdict }: { index: number; verdict: Verdict }) {
  const clamped = Math.min(100, Math.max(0, index));
  const needleAngle = (clamped / 100) * 180 - 180;
  const tip = polar(needleAngle, 66);
  const color = VERDICT_COLOR[verdict];

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 112" className="w-[210px]">
        <path d={arc(0, 180, 82)} stroke="rgba(255,255,255,0.07)" strokeWidth="17" fill="none" strokeLinecap="round" />
        <path d={arc(0, 36, 82)} stroke="#f0503c" strokeWidth="17" fill="none" strokeLinecap="round" opacity="0.85" />
        <path d={arc(36, 72, 82)} stroke="#f0b429" strokeWidth="17" fill="none" opacity="0.85" />
        <path d={arc(72, 108, 82)} stroke="#8fd14f" strokeWidth="17" fill="none" opacity="0.85" />
        <path d={arc(108, 180, 82)} stroke="#22c58b" strokeWidth="17" fill="none" strokeLinecap="round" opacity="0.85" />
        <line x1="100" y1="100" x2={tip.x} y2={tip.y} stroke={color} strokeWidth="3.5" strokeLinecap="round" />
        <circle cx="100" cy="100" r="6.5" fill={color} />
        <circle cx="100" cy="100" r="12" fill={color} opacity="0.18" />
      </svg>
      <div className="mt-1 text-center">
        <div className="text-[17px] font-bold" style={{ color }}>
          {VERDICT_LABEL[verdict]}
        </div>
        <div className="text-[11px] text-muted">TradingView gauge {clamped}/100</div>
      </div>
    </div>
  );
}

export function ConfidenceRing({ value, reason }: { value: number; reason?: string }) {
  const clamped = Math.min(100, Math.max(0, value));
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const color = clamped >= 65 ? "var(--color-buy)" : clamped >= 45 ? "var(--color-flat)" : "var(--color-sell)";
  const label = clamped >= 65 ? "Clean setup" : clamped >= 45 ? "Mixed signals" : "Low conviction";

  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 80 80" className="h-[86px] w-[86px] -rotate-90">
        <circle cx="40" cy="40" r={radius} stroke="rgba(255,255,255,0.09)" strokeWidth="8" fill="none" />
        <circle
          cx="40"
          cy="40"
          r={radius}
          stroke={color}
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
        />
      </svg>
      <div>
        <div className="label">Confidence · signal clarity</div>
        <div className="text-[26px] font-bold leading-tight" style={{ color }}>
          {clamped}
          <span className="text-[13px] font-semibold text-muted">/100</span>
        </div>
        <div className="text-[12px] font-semibold text-zinc-300">{label}</div>
        <div className="text-[10.5px] text-muted">how clean the read is — not the odds of profit</div>
        {reason ? <p className="mt-1 max-w-[280px] text-[11.5px] leading-relaxed text-muted">{reason}</p> : null}
      </div>
    </div>
  );
}

export function TonePill({ tone }: { tone: "buy" | "sell" | "neutral" | "unavailable" }) {
  const map = {
    buy: { color: "var(--color-buy)", text: "Buy" },
    sell: { color: "var(--color-sell)", text: "Sell" },
    neutral: { color: "var(--color-flat)", text: "Neutral" },
    unavailable: { color: "#6f6f76", text: "Not visible" },
  }[tone];
  return (
    <span
      className="rounded-md px-2 py-[3px] text-[10.5px] font-bold uppercase tracking-wide"
      style={{ color: map.color, background: `${map.color}1a`, border: `1px solid ${map.color}33` }}
    >
      {map.text}
    </span>
  );
}
