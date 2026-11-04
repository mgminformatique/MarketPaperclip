import type { Metadata } from "next";
import { headers } from "next/headers";
import { LocaleProvider } from "../components/i18n";
import type { Locale } from "../lib/i18n/locale";
import { translate } from "../lib/i18n/translate";
import { marketEnv } from "../lib/market/runtime";
import { canonicalOrigin, ogImage } from "../lib/seo";
import "@fontsource-variable/manrope";
import "@fontsource-variable/dm-sans";
import "./globals.css";
import "./market.css";
async function currentLocale(): Promise<Locale> {
  return (await headers()).get("x-market-language") === "fr" ? "fr" : "en";
}
export async function generateMetadata(): Promise<Metadata> {
  const locale = await currentLocale();
  const env = marketEnv();
  const origin = canonicalOrigin(env.SITE_URL);
  const title =
    locale === "en"
      ? "MarketPaperclip — The AI agent marketplace for developers"
      : "MarketPaperclip — Marketplace d’agents IA pour développeurs";
  const description =
    locale === "en"
      ? "Buy and sell ready-to-use AI agents and agent bundles for Claude, GPT, Gemini and Ollama. The developer marketplace built around Paperclip."
      : "Achetez et vendez des agents IA et des bundles d’agents prêts à l’emploi pour Claude, GPT, Gemini et Ollama. Le marketplace des développeurs, autour de Paperclip.";
  const image = ogImage(origin, locale);
  return {
    title,
    description,
    applicationName: "MarketPaperclip",
    metadataBase: new URL(origin),
    keywords:
      locale === "en"
        ? ["AI agents", "AI agent marketplace", "agent bundles", "Claude agents", "GPT agents", "Gemini", "Ollama", "Paperclip", "buy AI agents", "sell AI agents"]
        : ["agents IA", "marketplace d’agents IA", "bundles d’agents", "agents Claude", "agents GPT", "Gemini", "Ollama", "Paperclip", "acheter des agents IA", "vendre des agents IA"],
    creator: "MGM Informatique",
    publisher: "MGM Informatique",
    openGraph: {
      type: "website",
      siteName: "MarketPaperclip",
      title,
      description,
      locale: locale === "en" ? "en_CA" : "fr_CA",
      alternateLocale: locale === "en" ? "fr_CA" : "en_CA",
      images: [image],
    },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
    icons: {
      icon: [
        { url: "/favicon.svg", type: "image/svg+xml" },
        { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      ],
      apple: [{ url: "/icons/icon-180.png", sizes: "180x180" }],
    },
    manifest: "/manifest.webmanifest",
    // Ownership tokens for Google Search Console and Bing Webmaster Tools.
    verification: {
      google: env.GOOGLE_SITE_VERIFICATION || undefined,
      other: env.BING_SITE_VERIFICATION
        ? { "msvalidate.01": env.BING_SITE_VERIFICATION }
        : undefined,
    },
    formatDetection: { telephone: false },
  };
}
export const viewport = { themeColor: "#0c0e10" };
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await currentLocale();
  return (
    <html lang={locale}>
      <head>
        <script src="/interaction-recovery.js" />
      </head>
      <body>
        <noscript>
          <aside className="interaction-recovery" role="alert">
            {translate(
              "Activez JavaScript dans votre navigateur pour utiliser les filtres, les favoris et votre compte.",
              locale,
            )}
          </aside>
        </noscript>
        <LocaleProvider initialLocale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
