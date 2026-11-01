export type Locale = "fr" | "en";
export const localeCookie = "mp-language";
export function requestLocale(request: Request): Locale {
  const explicit = new URL(request.url).searchParams.get("lang");
  if (explicit === "en" || explicit === "fr") return explicit;
  const saved = request.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)mp-language=(en|fr)(?:;|$)/)?.[1];
  return saved === "en" ? "en" : "fr";
}
export function localizedHref(href: string, locale: Locale): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const url = new URL(href, "https://marketpaperclip.invalid");
  url.searchParams.set("lang", locale);
  return url.pathname + url.search + url.hash;
}
