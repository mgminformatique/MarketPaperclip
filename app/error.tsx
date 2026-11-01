"use client";
import { useI18n } from "../components/i18n";
export default function ErrorPage({ reset }: { reset: () => void }) {
  const { t, locale } = useI18n();
  return (
    <main className="interaction-error">
      <span className="eyebrow">{t("MARKETPAPERCLIP")}</span>
      <h1>{t("Reprenons là où vous étiez.")}</h1>
      <p>
        {t(
          "Un problème a interrompu l’interface. Vous pouvez réessayer ou revenir au catalogue.",
        )}
      </p>
      <div>
        <button className="button primary" onClick={reset}>
          {t("Réessayer")}
        </button>
        <a className="button secondary" href="/">
          {t("Retour au catalogue")}
        </a>
      </div>
    </main>
  );
}
