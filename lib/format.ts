import type { Analysis, SignalItem } from "./types";

export const VERDICT_LABEL: Record<Analysis["verdict"], string> = {
  strong_buy: "Strong Buy",
  buy: "Buy",
  neutral: "Neutral",
  sell: "Sell",
  strong_sell: "Strong Sell",
};

function joinLevels(levels: string[]): string {
  if (levels.length === 0) return "not readable from the chart";
  if (levels.length === 1) return levels[0];
  return `${levels.slice(0, -1).join(", ")} and ${levels[levels.length - 1]}`;
}

function tally(signals: SignalItem[]): string {
  const buy = signals.filter((item) => item.verdict === "buy").length;
  const sell = signals.filter((item) => item.verdict === "sell").length;
  const neutral = signals.filter((item) => item.verdict === "neutral").length;
  return `${buy} buy / ${neutral} neutral / ${sell} sell`;
}

const SOURCE_LABEL: Record<SignalItem["source"], string> = {
  read: "",
  computed: " (calculated)",
  estimated: " (estimated)",
  "not visible": " (no basis)",
};

function signalLine(item: SignalItem): string {
  return `   - ${item.name} ${item.reading}: ${item.verdict.toUpperCase()}${SOURCE_LABEL[item.source] ?? ""}${item.note ? ` (${item.note})` : ""}`;
}

export function analysisToText(analysis: Analysis): string {
  const lines: string[] = [
    `${analysis.instrument} · ${analysis.timeframe} · LTP ${analysis.lastPrice}`,
    `Verdict: ${VERDICT_LABEL[analysis.verdict]} (TradingView gauge ${analysis.gaugeIndex}/100) · Signal clarity ${analysis.confidence}/100 — how clean the read is, not the odds of profit`,
    "",
    analysis.summary,
    "",
    "Key Levels",
    "",
    `• Support: ${joinLevels(analysis.support)}`,
    "",
    `• Resistance: ${joinLevels(analysis.resistance)}`,
    "",
    "Outlook",
    "",
    analysis.outlook,
    "",
    "Why this confidence score",
    "",
    `• Base 50, final ${analysis.confidence} (each factor is capped in code, so no single screenshot can score near 100)`,
    ...analysis.confidenceFactors.map((factor) => `   - ${factor.points > 0 ? `+${factor.points}` : factor.points} ${factor.label}: ${factor.reason}`),
    `• ${analysis.confidenceReason}`,
    `• ${analysis.trendStrength}`,
    "",
    "Signals (TradingView house rules)",
    "",
    `• Moving Averages — ${tally(analysis.movingAverages)}`,
    ...analysis.movingAverages.map(signalLine),
    `• Oscillators — ${tally(analysis.oscillators)}`,
    ...analysis.oscillators.map(signalLine),
  ];

  if (analysis.priceAction.length) {
    lines.push("", "Price action visible", "", ...analysis.priceAction.map((item) => `• ${item}`));
  }
  if (analysis.riskPlan) {
    lines.push(
      "",
      "If-then plan (not advice)",
      "",
      `• Idea: ${analysis.riskPlan.idea}`,
      `• Trigger: ${analysis.riskPlan.trigger}`,
      `• Invalidation: ${analysis.riskPlan.invalidation}`,
      `• Target: ${analysis.riskPlan.target}`,
      `• Risk : reward: ${analysis.riskPlan.riskReward}`
    );
  }
  if (analysis.notVisible.length) {
    lines.push("", `Not visible in the screenshot: ${analysis.notVisible.join(", ")}`);
  }
  if (analysis.caveats.length) {
    lines.push("", "Caveats", "", ...analysis.caveats.map((item) => `• ${item}`));
  }
  lines.push("", "Educational technical read only — not financial advice. Wait for clear price confirmation.");
  return lines.join("\n");
}
