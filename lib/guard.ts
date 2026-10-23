import { NextResponse } from "next/server";

/**
 * ChartSense is built to run on the owner's own machine. Deploying it somewhere public without
 * thinking is how an API key ends up paying for strangers' requests, so the default posture is:
 * loopback only, unless CHARTSENSE_ACCESS_TOKEN is set and presented.
 */

const WINDOW_MS = 60_000;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function hostOf(request: Request): string {
  return (request.headers.get("host") ?? "").split(":")[0].toLowerCase().replace(/^\[|\]$/g, "");
}

function isLocal(request: Request): boolean {
  const host = hostOf(request);
  return LOCAL_HOSTS.has(host) || host.endsWith(".localhost");
}

function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}

function tokenFrom(request: Request): string {
  const header = request.headers.get("x-chartsense-token");
  if (header?.trim()) return header.trim();
  const cookie = request.headers.get("cookie");
  return /(?:^|;\s*)chartsense_token=([^;]*)/.exec(cookie ?? "")?.[1]?.trim() ?? "";
}

export function accessDenied(request: Request): NextResponse | null {
  if (isLocal(request)) return null;
  const required = process.env.CHARTSENSE_ACCESS_TOKEN?.trim();
  if (!required) {
    return NextResponse.json(
      { error: "This ChartSense instance is local-only. Set CHARTSENSE_ACCESS_TOKEN before serving it from a public host." },
      { status: 403 }
    );
  }
  if (tokenFrom(request) === required) return null;
  return NextResponse.json({ error: "Access token missing or wrong. Add it in Settings." }, { status: 401 });
}

export function tooManyRequests(request: Request, bucketName: string, limit: number): NextResponse | null {
  const key = `${bucketName}:${clientIp(request)}`;
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size > 4000) for (const [name, entry] of buckets) if (entry.resetAt <= now) buckets.delete(name);
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return null;
  }
  bucket.count += 1;
  if (bucket.count <= limit) return null;
  const seconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return NextResponse.json(
    { error: `Slow down — ${limit} ${bucketName} requests per minute. Try again in ${seconds}s.` },
    { status: 429, headers: { "retry-after": String(seconds) } }
  );
}
