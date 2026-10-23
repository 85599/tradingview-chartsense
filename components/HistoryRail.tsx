"use client";

import { VERDICT_LABEL } from "@/lib/format";
import type { HistoryEntry } from "@/lib/config";
import type { Verdict } from "@/lib/types";

const COLOR: Record<Verdict, string> = {
  strong_buy: "var(--color-buy)",
  buy: "var(--color-buy)",
  neutral: "var(--color-flat)",
  sell: "var(--color-sell)",
  strong_sell: "var(--color-sell)",
};

export function HistoryRail({
  entries,
  activeId,
  onSelect,
  onClear,
}: {
  entries: HistoryEntry[];
  activeId?: string;
  onSelect: (entry: HistoryEntry) => void;
  onClear: () => void;
}) {
  return (
    <div className="card-flat flex flex-col overflow-hidden p-3">
      <div className="mb-2 flex shrink-0 items-center justify-between">
        <span className="label">Saved reads</span>
        {entries.length > 0 && (
          <button onClick={onClear} className="text-[11px] text-muted hover:text-sell">
            clear
          </button>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="text-[12px] leading-relaxed text-muted">
          Every analysis you run is kept here on this computer, so you can compare today&apos;s read with yesterday&apos;s.
        </p>
      ) : (
        <div className="-mr-1 max-h-[44vh] flex-1 space-y-1.5 overflow-y-auto pr-1">
          {entries.map((entry) => (
            <button
              key={entry.id}
              onClick={() => onSelect(entry)}
              className={`w-full rounded-lg border px-2.5 py-2 text-left transition ${
                activeId === entry.id ? "border-accent/60 bg-accent/10" : "border-white/6 bg-white/[0.02] hover:border-white/20"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[12.5px] font-semibold">{entry.instrument}</span>
                <span className="shrink-0 text-[11px] font-bold" style={{ color: COLOR[entry.verdict] }}>
                  {VERDICT_LABEL[entry.verdict]}
                </span>
              </div>
              <div className="mt-0.5 flex items-center justify-between text-[10.5px] text-muted">
                <span>
                  {entry.timeframe} · conf {entry.confidence}
                </span>
                <span>{new Date(entry.createdAt).toLocaleDateString(undefined, { day: "2-digit", month: "short" })}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
