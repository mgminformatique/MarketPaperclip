export type Locale = "fr" | "en";
export const localeCookie = "mp-language";
// English is the site's default language. French is the default only for
// visitors who arrive from MGM Informatique's own site.
export const defaultLocale: Locale = "en";
const frenchReferrerDomains = ["mgminformatique.ca"];
// Browsers send the referring origin on cross-site links
// (strict-origin-when-cross-origin), which is what mgminformatique.ca uses.
export function referredByFrenchSite(request: Request): boolean {
  const referrer = request.headers.get("referer");
  if (!referrer) return false;
  try {
    const { protocol, hostname } = new URL(referrer);
    if (protocol !== "https:" && protocol !== "http:") return false;
    const host = hostname.toLowerCase();
    return frenchReferrerDomains.some(
      (domain) => host === domain || host.endsWith("." + domain),
    );
  } catch {
    return false;
  }
}
// Order: ?lang= in the URL, then the saved choice (cookie), then the referring
// site, then English. `remember` asks the server to save the result in the
// cookie: an explicit choice, or French picked for a visitor from
// mgminformatique.ca so the rest of their visit stays French.
export function localeChoice(request: Request): {
  locale: Locale;
  remember: boolean;
} {
  const explicit = new URL(request.url).searchParams.get("lang");
  if (explicit === "en" || explicit === "fr")
    return { locale: explicit, remember: true };
  const saved = request.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)mp-language=(en|fr)(?:;|$)/)?.[1];
  if (saved === "en" || saved === "fr")
    return { locale: saved, remember: false };
  if (referredByFrenchSite(request)) return { locale: "fr", remember: true };
  return { locale: defaultLocale, remember: false };
}
export function requestLocale(request: Request): Locale {
  return localeChoice(request).locale;
}
export function localizedHref(href: string, locale: Locale): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const url = new URL(href, "https://marketpaperclip.invalid");
  url.searchParams.set("lang", locale);
  return url.pathname + url.search + url.hash;
}
// The href crawlers, new tabs and no-JS browsing use. English is the default
// language and its canonical URLs carry no parameter, so English links point
// straight at them; French links keep ?lang=fr. In-app navigation still
// pushes the explicit localizedHref.
export function crawlableHref(href: string, locale: Locale): string {
  if (locale !== defaultLocale || !href.startsWith("/") || href.startsWith("//"))
    return localizedHref(href, locale);
  const url = new URL(href, "https://marketpaperclip.invalid");
  url.searchParams.delete("lang");
  return url.pathname + url.search + url.hash;
}
