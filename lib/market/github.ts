import { z } from "zod";
import { HttpError, type Config } from "./server";

const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const githubSelection = z
  .object({
    installation_id: id,
    repository_id: id,
    release_id: id,
    asset_id: id,
  })
  .strict();
export const githubSource = githubSelection
  .extend({
    owner: z.string().regex(/^[a-zA-Z0-9-]+$/),
    repo: z.string().regex(/^[a-zA-Z0-9_.-]+$/),
    tag: z.string().min(1).max(255),
    commit_sha: z.string().regex(/^[a-f0-9]{40}$/),
    asset_name: z
      .string()
      .min(5)
      .max(200)
      .regex(/\.(zip|json)$/i),
    size_bytes: z.number().int().positive().max(2147483647),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    immutable: z.boolean(),
  })
  .strict();
export type GitHubSource = z.infer<typeof githubSource>;
export type Repository = {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  permissions?: { admin?: boolean };
};
type Release = {
  id: number;
  tag_name: string;
  draft: boolean;
  immutable?: boolean;
  assets: Asset[];
};
type Asset = {
  id: number;
  name: string;
  size: number;
  state: string;
  digest?: string;
};
export class GitHubError extends HttpError {
  constructor(public upstreamStatus: number) {
    super(
      [401, 403, 404, 410, 422].includes(upstreamStatus) ? 409 : 503,
      "La source GitHub est indisponible. Réessayez ou contactez l’assistance.",
      "github_source_unavailable",
    );
  }
}
export function githubReady(c: Config) {
  return (
    c.GITHUB_DELIVERY_ENABLED === "true" &&
    !!(
      c.GITHUB_APP_ID &&
      c.GITHUB_APP_SLUG &&
      c.GITHUB_APP_PRIVATE_KEY &&
      c.GITHUB_APP_CLIENT_ID &&
      c.GITHUB_APP_CLIENT_SECRET &&
      c.GITHUB_APP_WEBHOOK_SECRET
    )
  );
}
export function requireGitHub(c: Config) {
  if (!githubReady(c))
    throw new HttpError(
      503,
      "La livraison GitHub n’est pas encore configurée.",
      "github_setup_required",
    );
}
const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
const encode = (data: unknown) =>
  base64url(new TextEncoder().encode(JSON.stringify(data)));
export async function appJwt(c: Config) {
  requireGitHub(c);
  const pem = c.GITHUB_APP_PRIVATE_KEY!.replace(/\\n/g, "\n");
  // PKCS#8 works in both Cloudflare Workers and Node. Convert GitHub's PKCS#1 PEM at setup.
  const der = Uint8Array.from(
    atob(pem.replace(/-----[^-]+-----|\s/g, "")),
    (v) => v.charCodeAt(0),
  );
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "pkcs8",
      der,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch {
    throw new HttpError(
      503,
      "La clé privée de la GitHub App doit être au format PKCS#8.",
      "github_setup_required",
    );
  }
  const now = Math.floor(Date.now() / 1000);
  const payload =
    encode({ alg: "RS256", typ: "JWT" }) +
    "." +
    encode({ iat: now - 60, exp: now + 540, iss: c.GITHUB_APP_ID });
  return (
    payload +
    "." +
    base64url(
      new Uint8Array(
        await crypto.subtle.sign(
          "RSASSA-PKCS1-v1_5",
          key,
          new TextEncoder().encode(payload),
        ),
      ),
    )
  );
}
export async function githubRequest(
  path: string,
  token: string,
  options: RequestInit = {},
) {
  if (!path.startsWith("/") || path.startsWith("//"))
    throw new Error("Invalid GitHub API path");
  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    response = await fetch("https://api.github.com" + path, {
      ...options,
      redirect: "manual",
      signal: controller.signal,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "MarketPaperclip",
        ...options.headers,
        Authorization: "Bearer " + token,
      },
    });
  } catch {
    throw new GitHubError(503);
  } finally {
    // Time out connection/headers, without aborting a large 200 file stream later.
    clearTimeout(timeout);
  }
  if (!response.ok && response.status !== 302)
    throw new GitHubError(response.status);
  return response;
}
export async function installationToken(
  c: Config,
  installation: number,
  repository: number,
) {
  const response = await githubRequest(
    `/app/installations/${id.parse(installation)}/access_tokens`,
    await appJwt(c),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        permissions: { contents: "read" },
        repository_ids: [id.parse(repository)],
      }),
    },
  );
  const data = (await response.json()) as { token: string };
  if (!data.token) throw new GitHubError(503);
  return data.token;
}
export async function listUserRepositories(
  token: string,
  installation: number,
) {
  const repositories: Repository[] = [];
  for (let page = 1; page <= 100; page++) {
    const data = (await (
      await githubRequest(
        `/user/installations/${id.parse(installation)}/repositories?per_page=100&page=${page}`,
        token,
      )
    ).json()) as { repositories: Repository[] };
    // Binding only installations is insufficient: an org installation can expose repos this user cannot administer.
    repositories.push(
      ...data.repositories.filter((repo) => repo.permissions?.admin),
    );
    if (data.repositories.length < 100) return repositories;
  }
  throw new HttpError(
    400,
    "Limitez l’installation aux dépôts de distribution concernés.",
  );
}
export async function selectedSource(
  c: Config,
  selected: z.infer<typeof githubSelection>,
) {
  const token = await installationToken(
    c,
    selected.installation_id,
    selected.repository_id,
  );
  const repo = (await (
    await githubRequest(`/repositories/${selected.repository_id}`, token)
  ).json()) as Repository;
  const prefix = `/repos/${encodeURIComponent(repo.owner.login)}/${encodeURIComponent(repo.name)}`;
  const release = (await (
    await githubRequest(`${prefix}/releases/${selected.release_id}`, token)
  ).json()) as Release;
  const asset = release.assets.find((a) => a.id === selected.asset_id);
  if (
    release.draft ||
    !asset ||
    asset.state !== "uploaded" ||
    !/^sha256:[a-f0-9]{64}$/.test(asset.digest || "")
  )
    throw new HttpError(
      409,
      "Choisissez une Release publiée et une archive avec une empreinte SHA-256 GitHub.",
      "github_asset_invalid",
    );
  const commit = (await (
    await githubRequest(
      `${prefix}/commits/${encodeURIComponent(release.tag_name)}`,
      token,
    )
  ).json()) as { sha: string };
  const source = githubSource.parse({
    ...selected,
    owner: repo.owner.login,
    repo: repo.name,
    tag: release.tag_name,
    commit_sha: commit.sha,
    asset_name: asset.name,
    size_bytes: asset.size,
    sha256: asset.digest!.slice(7),
    immutable: !!release.immutable,
  });
  return { source, token, prefix };
}
export async function verifySource(c: Config, input: unknown) {
  const expected = githubSource.parse(input);
  const current = await selectedSource(
    c,
    githubSelection.parse({
      installation_id: expected.installation_id,
      repository_id: expected.repository_id,
      release_id: expected.release_id,
      asset_id: expected.asset_id,
    }),
  );
  for (const key of [
    "sha256",
    "size_bytes",
    "asset_name",
    "tag",
    "commit_sha",
  ] as const)
    if (current.source[key] !== expected[key])
      throw new HttpError(
        409,
        "Le fichier GitHub ne correspond plus à la version achetée.",
        "github_source_changed",
      );
  return current;
}
export function trustedDownloadUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new GitHubError(502);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    !(
      [
        "release-assets.githubusercontent.com",
        "objects.githubusercontent.com",
      ].includes(url.hostname) ||
      /^github-production-release-asset-[a-f0-9]+\.s3\.amazonaws\.com$/.test(
        url.hostname,
      )
    )
  )
    throw new GitHubError(502);
  return url.href;
}
export async function githubDownload(
  c: Config,
  input: unknown,
  cookies: string[] = [],
) {
  const { source, token, prefix } = await verifySource(c, input);
  const response = await githubRequest(
    `${prefix}/releases/assets/${source.asset_id}`,
    token,
    { headers: { Accept: "application/octet-stream" } },
  );
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  if (response.status === 302) {
    headers.set(
      "Location",
      trustedDownloadUrl(response.headers.get("location") || ""),
    );
    return new Response(null, { status: 303, headers });
  }
  if (response.status !== 200 || !response.body) throw new GitHubError(502);
  const length = response.headers.get("content-length");
  if (length && Number(length) !== source.size_bytes)
    throw new HttpError(
      409,
      "La taille du fichier GitHub a changé.",
      "github_source_changed",
    );
  headers.set("Content-Type", "application/octet-stream");
  headers.set(
    "Content-Disposition",
    `attachment; filename="package.${source.asset_name.toLowerCase().endsWith(".json") ? "json" : "zip"}"; filename*=UTF-8''${encodeURIComponent(source.asset_name).replace(/['()*]/g, (v) => "%" + v.charCodeAt(0).toString(16))}`,
  );
  // Pass the readable body through; no ZIP is buffered or stored by the marketplace.
  return new Response(response.body, { headers });
}
export async function verifyWebhook(req: Request, c: Config) {
  if (!c.GITHUB_APP_WEBHOOK_SECRET)
    throw new HttpError(503, "Webhook GitHub non configuré.");
  const raw = await req.text();
  if (raw.length > 1000000)
    throw new HttpError(413, "Événement trop volumineux.");
  const signature = req.headers.get("x-hub-signature-256") || "";
  if (!/^sha256=[a-f0-9]{64}$/.test(signature))
    throw new HttpError(400, "Signature GitHub invalide.");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(c.GITHUB_APP_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const digest = Uint8Array.from(signature.slice(7).match(/../g)!, (v) =>
    parseInt(v, 16),
  );
  if (
    !(await crypto.subtle.verify(
      "HMAC",
      key,
      digest,
      new TextEncoder().encode(raw),
    ))
  )
    throw new HttpError(400, "Signature GitHub invalide.");
  return JSON.parse(raw);
}
