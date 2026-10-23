"use client";

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2.5 select-none">
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M3 6h13M5 12h16M8 18h11" stroke="url(#lg)" strokeWidth="2.6" strokeLinecap="round" />
        <defs>
          <linearGradient id="lg" x1="3" y1="6" x2="21" y2="18" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ffb066" />
            <stop offset="1" stopColor="#f4501e" />
          </linearGradient>
        </defs>
      </svg>
      <span className="text-[19px] font-bold tracking-tight">ChartSense</span>
    </span>
  );
}

export function ProviderDots({ configured }: { configured: Record<string, boolean> }) {
  return (
    <div className="flex items-center gap-3 text-[11px] font-semibold text-muted">
      {(["grok", "openai", "gemini", "openrouter"] as const).map((name) => (
        <span key={name} className="flex items-center gap-1.5 capitalize">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: configured[name] ? "var(--color-buy)" : "rgba(255,255,255,0.22)" }}
          />
          {name}
        </span>
      ))}
    </div>
  );
}
