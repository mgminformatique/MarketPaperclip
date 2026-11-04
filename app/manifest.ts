import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MarketPaperclip — AI agent marketplace",
    short_name: "MarketPaperclip",
    description:
      "Buy and sell AI agents and agent bundles for Claude, GPT, Gemini and Ollama.",
    start_url: "/",
    display: "standalone",
    background_color: "#0c0e10",
    theme_color: "#0c0e10",
    lang: "en",
    categories: ["developer", "productivity", "business"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
