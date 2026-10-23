"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/types";

function renderInline(line: string) {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index} className="font-semibold text-white">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={index}>{part}</span>
    )
  );
}

function Bubble({ content }: { content: string }) {
  const lines = content.split("\n").filter((line) => line.trim() !== "");
  return (
    <div className="space-y-1.5">
      {lines.map((line, index) => {
        const bullet = /^[-•*]\s+/.test(line);
        const text = bullet ? line.replace(/^[-•*]\s+/, "") : line;
        return bullet ? (
          <div key={index} className="flex gap-2 pl-0.5 text-[13px] leading-relaxed">
            <span className="text-accent">•</span>
            <span>{renderInline(text)}</span>
          </div>
        ) : (
          <p key={index} className="text-[13px] leading-relaxed">
            {renderInline(text)}
          </p>
        );
      })}
    </div>
  );
}

const QUICK = [
  "Explain support and resistance again—start with the nearest ones.",
  "Why is the confidence score this low — which factors are pulling it down?",
  "What is the best level for a stop-loss?",
  "Is this setup valid according to the 1D timeframe as well?",
];

export function ChatPanel({
  messages,
  busy,
  disabled,
  onSend,
}: {
  messages: ChatMessage[];
  busy: boolean;
  disabled: boolean;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy]);

  function submit() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    onSend(text);
  }

  return (
    <div className="card flex h-full max-h-[calc(100vh-96px)] min-h-[420px] flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <h3 className="text-[13.5px] font-bold">Ask about this chart</h3>
          <p className="text-[11px] text-muted">Chart is sent once — later questions reuse the saved analysis</p>
        </div>
        <span className="chip shrink-0">AI chat</span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3.5">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-[12.5px] text-muted">
              Post your chart to get an analysis, then ask your questions here—whether about levels, stop-losses, the reasoning behind your conviction, or a second opinion.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK.map((question) => (
                <button
                  key={question}
                  disabled={disabled}
                  onClick={() => onSend(question)}
                  className="rounded-full border border-line bg-white/[0.04] px-2.5 py-1 text-[11.5px] text-zinc-300 hover:border-white/25 disabled:opacity-40"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            className={
              message.role === "user"
                ? "ml-auto max-w-[86%] rounded-2xl rounded-br-md bg-white/[0.07] px-3.5 py-2.5 text-zinc-100"
                : "mr-auto max-w-[92%] rounded-2xl rounded-bl-md border border-line bg-gradient-to-br from-accent/[0.13] to-transparent px-3.5 py-2.5 text-zinc-200"
            }
          >
            <Bubble content={message.content} />
          </div>
        ))}

        {busy && (
          <div className="mr-auto rounded-2xl rounded-bl-md border border-line bg-white/[0.03] px-3.5 py-3">
            <span className="flex gap-1.5">
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-accent"
                  style={{ animationDelay: `${dot * 0.18}s` }}
                />
              ))}
            </span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-line p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            rows={2}
            placeholder={disabled ? "Drop a chart first, then ask" : "Ask anything about this chart…"}
            disabled={disabled || busy}
            className="field resize-none text-[13px]"
          />
          <button className="btn btn-primary" onClick={submit} disabled={disabled || busy || !draft.trim()}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
