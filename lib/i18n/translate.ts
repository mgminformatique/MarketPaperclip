import english from "./en.json";
import type { Locale } from "./locale";
const dictionary: Record<string, string> = english;
export const normalizeMessage = (value: string) =>
  value.replace(/\s+/g, " ").trim();
const normalized = new Map(
  Object.entries(dictionary).map(([key, value]) => [
    normalizeMessage(key),
    value,
  ]),
);
const patterns: [RegExp, (...parts: string[]) => string][] = [
  [/^Avis \((\d+)\)$/, (count) => `Reviews (${count})`],
  [
    /^(\d+) agents dans ce bundle$/,
    (count) => `${count} agents in this bundle`,
  ],
  [
    /^(\d+) produits? dans votre studio$/,
    (count) => `${count} product${count === "1" ? "" : "s"} in your studio`,
  ],
  [
    /^Commission du marketplace : (.+) %$/,
    (rate) => `Marketplace fee: ${rate}%`,
  ],
  [/^Modifier (.+)$/, (title) => `Edit ${title}`],
  [/^(\d+) agents · Bundle$/, (count) => `${count} agents · Bundle`],
  [/^(\d+) AGENTS · BUNDLE$/, (count) => `${count} AGENTS · BUNDLE`],
  [
    /^Configuration de (\d+) agents$/,
    (count) => `Configuration for ${count} agents`,
  ],
  [/^Ajouter aux favoris : (.+)$/, (title) => `Add to favorites: ${title}`],
  [
    /^Retirer des favoris : (.+)$/,
    (title) => `Remove from favorites: ${title}`,
  ],
  [/^Illustration 3D de (.+)$/, (title) => `3D illustration of ${title}`],
  [/^Votre expérience avec (.+)$/, (title) => `Your experience with ${title}`],
  [/^Commission de (.+) %$/, (rate) => `${rate}% platform fee`],
  [/^Bienvenue, (.+)\.$/, (name) => `Welcome, ${name}.`],
];
export function translate<T>(value: T, locale: Locale): T {
  if (locale !== "en" || typeof value !== "string") return value;
  const key = normalizeMessage(value);
  let translated = normalized.get(key);
  if (translated === undefined) {
    for (const [pattern, replace] of patterns) {
      const match = key.match(pattern);
      if (match) {
        translated = replace(...match.slice(1));
        break;
      }
    }
  }
  if (translated === undefined) return value;
  return (value.match(/^\s*/)?.[0] +
    translated +
    value.match(/\s*$/)?.[0]) as T;
}
