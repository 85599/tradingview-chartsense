import { NextResponse } from "next/server";
import { chatWithChart, ProviderError } from "@/lib/ai";
import { accessDenied, tooManyRequests } from "@/lib/guard";
import { chatSystemPrompt } from "@/lib/prompt";
import { BadRequest, parseAnalysis, parseChatMessages, parseImages, parseLanguage, parseProvider, readJson } from "@/lib/request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = accessDenied(request) ?? tooManyRequests(request, "chat", 12);
  if (denied) return denied;

  try {
    const body = await readJson(request);
    const messages = parseChatMessages(body?.messages);
    if (messages.filter((message) => message.role === "user").length === 0) {
      return NextResponse.json({ error: "Ask a question about the chart first." }, { status: 400 });
    }

    const result = await chatWithChart({
      provider: parseProvider(body?.provider),
      system: chatSystemPrompt(parseAnalysis(body?.analysis), parseLanguage(body?.language)),
      messages,
      images: parseImages(body?.images, "chat"),
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BadRequest) return NextResponse.json({ error: error.message }, { status: 400 });
    const message = error instanceof ProviderError ? error.message : (error as Error).message;
    return NextResponse.json({ error: message }, { status: error instanceof ProviderError ? 502 : 500 });
  }
}
