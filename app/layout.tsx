import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ChartSense — drop a TradingView chart, get the read",
  description:
    "Drag and drop a TradingView screenshot and get a plain-English technical analysis with support, resistance and a trade confidence score. Powered by Grok, OpenAI, Gemini or OpenRouter.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
