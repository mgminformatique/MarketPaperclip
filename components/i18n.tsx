"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Globe } from "lucide-react";
import { translate } from "../lib/i18n/translate";
import { localeCookie, type Locale } from "../lib/i18n/locale";
const Context = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
}>({ locale: "fr", setLocale: () => {} });
export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const [locale, updateLocale] = useState(initialLocale);
  const setLocale = useCallback((next: Locale) => {
    updateLocale(next);
    document.cookie = `${localeCookie}=${next}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
    const url = new URL(window.location.href);
    url.searchParams.set("lang", next);
    window.history.replaceState(window.history.state, "", url);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title =
      locale === "en"
        ? "MarketPaperclip — The agent marketplace"
        : "MarketPaperclip — Le marketplace des agents";
    const description = document.querySelector('meta[name="description"]');
    description?.setAttribute(
      "content",
      locale === "en"
        ? "Discover, buy and sell AI agents and agent bundles. Built for developers, around Paperclip."
        : "Découvrez, achetez et vendez des agents IA et des bundles. Pensé pour les développeurs, autour de Paperclip.",
    );
  }, [locale]);
  // Back/forward navigation can restore a URL with an explicit language.
  useEffect(() => {
    const restore = () => {
      const lang = new URL(window.location.href).searchParams.get("lang");
      if (lang === "fr" || lang === "en") {
        updateLocale(lang);
        document.cookie = `${localeCookie}=${lang}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
      }
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useI18n() {
  const context = useContext(Context);
  const t = useCallback(
    <T,>(value: T): T => translate(value, context.locale),
    [context.locale],
  );
  return { ...context, t };
}
export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();
  return (
    <div
      className="language-switch"
      role="group"
      aria-label={locale === "en" ? "Website language" : "Langue du site"}
    >
      <Globe size={14} aria-hidden="true" />
      {(["fr", "en"] as const).map((language) => (
        <button
          key={language}
          type="button"
          lang={language}
          aria-label={
            language === "en" ? "Switch to English" : "Passer en français"
          }
          aria-pressed={locale === language}
          onClick={() => setLocale(language)}
        >
          {language.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
