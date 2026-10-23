import { NextResponse } from "next/server";
import { analyzeChart, ProviderError } from "@/lib/ai";
import { addHistory } from "@/lib/config";
import { analysisToText } from "@/lib/format";
import { accessDenied, tooManyRequests } from "@/lib/guard";
import { BadRequest, MAX_DATA_CHARS, MAX_HINT_CHARS, parseImages, parseLanguage, parseProvider, parseText, readJson } from "@/lib/request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = accessDenied(request) ?? tooManyRequests(request, "analysis", 6);
  if (denied) return denied;

  try {
    const body = await readJson(request);
    const images = parseImages(body?.images);
    if (images.length === 0) {
      return NextResponse.json({ error: "Drop a valid TradingView chart screenshot first." }, { status: 400 });
    }

    const result = await analyzeChart({
      images,
      hint: parseText(body?.hint, MAX_HINT_CHARS),
      marketData: parseText(body?.marketData, MAX_DATA_CHARS),
      language: parseLanguage(body?.language),
      provider: parseProvider(body?.provider),
    });
    const id = crypto.randomUUID();
    if (!result.demo) {
      await addHistory({
        id,
        createdAt: new Date().toISOString(),
        provider: result.provider,
        model: result.model,
        instrument: result.analysis.instrument,
        timeframe: result.analysis.timeframe,
        verdict: result.analysis.verdict,
        confidence: result.analysis.confidence,
        analysis: result.analysis,
        text: analysisToText(result.analysis),
      });
    }
    return NextResponse.json({ ...result, id: result.demo ? undefined : id, text: analysisToText(result.analysis) });
  } catch (error) {
    if (error instanceof BadRequest) return NextResponse.json({ error: error.message }, { status: 400 });
    const message = error instanceof ProviderError ? error.message : (error as Error).message;
    const status = error instanceof ProviderError ? 502 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
