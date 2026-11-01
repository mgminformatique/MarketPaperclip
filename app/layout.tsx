import type { Metadata } from "next";
import { headers } from "next/headers";
import { LocaleProvider } from "../components/i18n";
import type { Locale } from "../lib/i18n/locale";
import { translate } from "../lib/i18n/translate";
import "@fontsource-variable/manrope";
import "@fontsource-variable/dm-sans";
import "./globals.css";
async function currentLocale(): Promise<Locale> {
  return (await headers()).get("x-market-language") === "en" ? "en" : "fr";
}
export async function generateMetadata(): Promise<Metadata> {
  const locale = await currentLocale();
  const title =
    locale === "en"
      ? "MarketPaperclip — The agent marketplace"
      : "MarketPaperclip — Le marketplace des agents";
  const description =
    locale === "en"
      ? "Discover, buy and sell AI agents and agent bundles. Built for developers, around Paperclip."
      : "Découvrez, achetez et vendez des agents IA et des bundles. Pensé pour les développeurs, autour de Paperclip.";
  return {
    title,
    description,
    metadataBase: new URL("https://marketpaperclip.com"),
    openGraph: {
      title,
      description,
      locale: locale === "en" ? "en_CA" : "fr_CA",
      alternateLocale: locale === "en" ? "fr_CA" : "en_CA",
      images: ["/art/hero.webp"],
    },
    icons: { icon: "/favicon.svg" },
  };
}
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
