"use client";

import { useRef, useState } from "react";

export interface DroppedImage {
  id: string;
  name: string;
  dataUrl: string;
}

export function DropZone({
  images,
  onFiles,
  onRemove,
  busy,
}: {
  images: DroppedImage[];
  onFiles: (files: File[]) => void;
  onRemove: (id: string) => void;
  busy: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          onFiles(Array.from(event.dataTransfer.files));
        }}
        onClick={() => inputRef.current?.click()}
        className={`relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-9 text-center transition ${
          over ? "border-accent bg-accent/10" : "border-white/15 bg-black/30 hover:border-white/30"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            onFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-[19px] text-[#170700] shadow-[0_10px_30px_-12px_rgba(255,122,47,0.8)]">
          ↥
        </div>
        <p className="text-[15px] font-semibold">Drag & drop your TradingView chart here</p>
        <p className="mt-1 text-[12.5px] text-muted">
          or click to browse · press <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[11px]">Ctrl</kbd>+
          <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[11px]">V</kbd> after a screenshot · up to 4 images for
          multi-timeframe confluence
        </p>
      </div>

      {images.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((image, index) => (
            <div key={image.id} className="group relative overflow-hidden rounded-xl border border-line bg-black/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.dataUrl} alt={`Chart ${index + 1}`} className="h-[104px] w-full object-cover" />
              <button
                onClick={() => onRemove(image.id)}
                className="absolute right-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-bold text-white opacity-80 hover:bg-sell disabled:opacity-30"
                disabled={busy}
                aria-label="Remove image"
              >
                ✕
              </button>
              <span className="absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold">
                {index + 1}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
