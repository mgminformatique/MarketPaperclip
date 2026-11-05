"use client";
import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import { api, Notice } from "./market-ui";
import { useI18n } from "./i18n";

export type GitHubSelection = {
  installation_id: number;
  repository_id: number;
  release_id: number;
  asset_id: number;
};
type Repository = { id: number; installation_id: number; full_name: string };
type Release = {
  id: number;
  tag: string;
  immutable: boolean;
  assets: Array<{ id: number; name: string; size: number }>;
};
export function GitHubPackagePicker({
  disabled,
  selection,
  onSelect,
  beforeConnect,
}: {
  disabled: boolean;
  selection: GitHubSelection | null;
  onSelect: (selection: GitHubSelection | null, version?: string) => void;
  beforeConnect: () => void;
}) {
  const { t } = useI18n();
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [repositoryKey, setRepositoryKey] = useState("");
  const [releases, setReleases] = useState<Release[]>([]);
  const [releaseId, setReleaseId] = useState("");
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const repository = repositories.find(
    (r) => `${r.installation_id}:${r.id}` === repositoryKey,
  );
  const release = releases.find((r) => String(r.id) === releaseId);
  useEffect(() => {
    let active = true;
    api("github/repositories")
      .then((data) => {
        if (active) setRepositories(data.repositories);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setReleases([]);
    setMore(false);
    if (!repository) return;
    setBusy(true);
    api(
      `github/releases?installation_id=${repository.installation_id}&repository_id=${repository.id}&page=${page}`,
    )
      .then((data) => {
        if (active) {
          setReleases(data.releases);
          setMore(data.more);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [repositoryKey, page, repository]);
  async function connect() {
    setBusy(true);
    setError("");
    try {
      beforeConnect();
      const data = await api("github/start", {
        next: window.location.pathname,
      });
      window.location.assign(data.url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <section className="panel form-stack" aria-label={t("Package GitHub")}>
      <h3>
        <FolderOpen size={20} /> {t("Votre package reste sur GitHub")}
      </h3>
      <p className="muted">
        {t(
          "Connectez un dépôt de distribution, puis choisissez une Release publiée et son archive. Les acheteurs n’ont pas besoin d’un compte GitHub.",
        )}
      </p>
      {error && <Notice error>{t(error)}</Notice>}
      <button
        type="button"
        className="button secondary"
        disabled={disabled || busy}
        onClick={connect}
      >
        {t(
          repositories.length
            ? "Gérer les dépôts GitHub"
            : "Connecter mon dépôt GitHub",
        )}
      </button>
      {!!repositories.length && (
        <>
          <label>
            {t("Dépôt de distribution")}
            <select
              value={repositoryKey}
              disabled={disabled || busy}
              onChange={(e) => {
                setRepositoryKey(e.target.value);
                setPage(1);
                setReleaseId("");
                setError("");
                onSelect(null);
              }}
            >
              <option value="">{t("Choisir un dépôt")}</option>
              {repositories.map((r) => (
                <option
                  key={`${r.installation_id}:${r.id}`}
                  value={`${r.installation_id}:${r.id}`}
                >
                  {r.full_name}
                </option>
              ))}
            </select>
          </label>
          {repository && (
            <>
              <label>
                {t("Release publiée")}
                <select
                  value={releaseId}
                  disabled={disabled || busy}
                  onChange={(e) => {
                    setReleaseId(e.target.value);
                    onSelect(null);
                  }}
                >
                  <option value="">{t("Choisir une Release")}</option>
                  {releases.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.tag}
                      {r.immutable ? t(" · immuable") : ""}
                    </option>
                  ))}
                </select>
              </label>
              {(more || page > 1) && (
                <div className="button-row">
                  <button
                    type="button"
                    className="button secondary small"
                    disabled={disabled || busy || page === 1}
                    onClick={() => {
                      setPage(page - 1);
                      setReleaseId("");
                      onSelect(null);
                    }}
                  >
                    {t("Précédent")}
                  </button>
                  <button
                    type="button"
                    className="button secondary small"
                    disabled={disabled || busy || !more}
                    onClick={() => {
                      setPage(page + 1);
                      setReleaseId("");
                      onSelect(null);
                    }}
                  >
                    {t("Suivant")}
                  </button>
                </div>
              )}
            </>
          )}
          {release && (
            <label>
              {t("Archive destinée aux acheteurs")}
              <select
                value={selection?.asset_id || ""}
                disabled={disabled || busy}
                onChange={(e) => {
                  const asset = release.assets.find(
                    (a) => a.id === Number(e.target.value),
                  );
                  const version = release.tag.replace(/^v/, "");
                  onSelect(
                    asset && repository
                      ? {
                          installation_id: repository.installation_id,
                          repository_id: repository.id,
                          release_id: release.id,
                          asset_id: asset.id,
                        }
                      : null,
                    /^\d+\.\d+\.\d+$/.test(version) ? version : undefined,
                  );
                }}
              >
                <option value="">{t("Choisir une archive")}</option>
                {release.assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {(a.size / 1048576).toFixed(1)} Mo
                  </option>
                ))}
              </select>
            </label>
          )}
          {release && !release.assets.length && (
            <p className="muted">
              {t(
                "Ajoutez à cette Release un ZIP ou JSON avec une empreinte SHA-256 GitHub, de moins de 2 Gio.",
              )}
            </p>
          )}
        </>
      )}
      <small>
        {t(
          "Conservez les versions vendues et l’accès de l’application. Une source retirée suspend les nouvelles ventes; l’assistance reste disponible aux acheteurs.",
        )}
      </small>
    </section>
  );
}
