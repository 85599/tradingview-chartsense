import { NextResponse } from "next/server";
import { clearHistory, listHistory } from "@/lib/config";
import { accessDenied, tooManyRequests } from "@/lib/guard";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const blocked = accessDenied(request) ?? tooManyRequests(request, "history", 30);
  if (blocked) return blocked;
  return NextResponse.json(await listHistory());
}

export async function DELETE(request: Request) {
  const blocked = accessDenied(request) ?? tooManyRequests(request, "history", 10);
  if (blocked) return blocked;
  await clearHistory();
  return NextResponse.json({ ok: true });
}
