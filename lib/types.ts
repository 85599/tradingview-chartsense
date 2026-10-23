export type Provider = "grok" | "openai" | "gemini" | "openrouter" | "demo";

export type Verdict = "strong_buy" | "buy" | "neutral" | "sell" | "strong_sell";

export type SignalTone = "buy" | "sell" | "neutral" | "unavailable";

export type SignalSource = "computed" | "read" | "estimated" | "not visible";

export interface SignalItem {
  name: string;
  reading: string;
  verdict: SignalTone;
  source: SignalSource;
  note?: string;
}

export interface ConfidenceFactor {
  label: string;
  points: number;
  reason: string;
}

export interface RiskPlan {
  idea: string;
  trigger: string;
  invalidation: string;
  target: string;
  riskReward: string;
}

export interface Analysis {
  instrument: string;
  timeframe: string;
  lastPrice: string;
  verdict: Verdict;
  gaugeIndex: number;
  bias: string;
  summary: string;
  support: string[];
  resistance: string[];
  outlook: string;
  confidence: number;
  confidenceFactors: ConfidenceFactor[];
  confidenceReason: string;
  trendStrength: string;
  movingAverages: SignalItem[];
  oscillators: SignalItem[];
  priceAction: string[];
  riskPlan: RiskPlan | null;
  notVisible: string[];
  caveats: string[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
