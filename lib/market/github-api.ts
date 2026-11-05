import { z } from "zod";
import {
  check,
  HttpError,
  siteOrigin,
  type Config,
  type admin,
  type context,
} from "./server";
import { safeReturn } from "./model";
import {
  appJwt,
  githubRequest,
  installationToken,
  listUserRepositories,
  requireGitHub,
  selectedSource,
  githubSelection,
  verifySource,
  githubDownload,
  GitHubError,
  verifyWebhook,
  type GitHubSource,
  type Repository,
} from "./github";

type Db = ReturnType<typeof admin>;
type Context = ReturnType<typeof context>;
const numericId = z.coerce
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);
async function hashState(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function permittedRepository(
  db: Db,
  seller: string,
  installation: number,
  repository: number,
) {
  const { data, error } = await db
    .from("github_connections")
    .select("repositories")
    .eq("seller_id", seller)
    .eq("installation_id", installation)
    .maybeSingle();
  check(error);
  if (
    !data ||
    !(data.repositories as Repository[]).some((r) => r.id === repository)
  )
    throw new HttpError(
      403,
      "Reconnectez un dépôt GitHub que vous administrez.",
    );
}
export async function checkGitHubAvailability(
  db: Db,
  c: Config,
  product: string,
  source: GitHubSource,
) {
  try {
    await verifySource(c, source);
  } catch (error) {
    await noteSourceFailure(db, product, source, error);
    throw error;
  }
  const { error } = await db.rpc("market_github_source_health", {
    p_product: product,
    p_source: source,
    p_available: true,
  });
  check(error);
}
async function noteSourceFailure(
  db: Db,
  product: string,
  source: GitHubSource,
  error: unknown,
) {
  // Rate limits, configuration errors and network outages must not delist healthy products.
  if (
    (error instanceof GitHubError &&
      [404, 410, 422].includes(error.upstreamStatus)) ||
    (error instanceof HttpError &&
      ["github_source_changed", "github_asset_invalid"].includes(error.code))
  ) {
    const { error: failure } = await db.rpc("market_github_source_health", {
      p_product: product,
      p_source: source,
      p_available: false,
    });
    check(failure);
  }
}
export async function deliverGitHub(
  db: Db,
  c: Config,
  product: string,
  source: GitHubSource,
  cookies: string[],
) {
  try {
    return await githubDownload(c, source, cookies);
  } catch (error) {
    await noteSourceFailure(db, product, source, error);
    throw error;
  }
}
export async function githubRoutes(
  req: Request,
  c: Config,
  db: Db,
  ctx: Context,
  seller: string,
): Promise<Response | null> {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\//, "");
  if (!route.startsWith("github/")) return null;
  requireGitHub(c);
  if (route === "github/start" && req.method === "POST") {
    const body = z
      .object({ next: z.string().max(300).optional() })
      .strict()
      .parse(await req.json());
    const state = crypto.randomUUID() + crypto.randomUUID();
    const origin = siteOrigin(c, req);
    const { error } = await db.from("github_oauth_states").insert({
      state_hash: await hashState(state),
      seller_id: seller,
      origin,
      next_path: safeReturn(body.next || "/studio"),
      expires_at: new Date(Date.now() + 600000).toISOString(),
    });
    check(error);
    ctx.cookies.push(
      `mp-github-state=${state}; Path=/api/github/callback; HttpOnly; SameSite=Lax; Max-Age=600${url.protocol === "https:" ? "; Secure" : ""}`,
    );
    return ctx.json({
      url: `https://github.com/apps/${encodeURIComponent(c.GITHUB_APP_SLUG!)}/installations/new?state=${state}`,
    });
  }
  if (route === "github/callback" && req.method === "GET") {
    const state = url.searchParams.get("state") || "";
    const cookie = (req.headers.get("cookie") || "")
      .split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("mp-github-state="))
      ?.slice(16);
    ctx.cookies.push(
      `mp-github-state=; Path=/api/github/callback; HttpOnly; SameSite=Lax; Max-Age=0${url.protocol === "https:" ? "; Secure" : ""}`,
    );
    if (!state || state.length > 100 || state !== cookie)
      throw new HttpError(
        403,
        "La connexion GitHub a expiré. Recommencez depuis le studio.",
      );
    // Delete + return is a single-use claim, bound to the logged-in seller and callback origin.
    const { data: claim, error } = await db
      .from("github_oauth_states")
      .delete()
      .eq("state_hash", await hashState(state))
      .eq("seller_id", seller)
      .eq("origin", siteOrigin(c, req))
      .gt("expires_at", new Date().toISOString())
      .select("next_path,installation_id")
      .maybeSingle();
    check(error);
    if (!claim)
      throw new HttpError(
        403,
        "La connexion GitHub a expiré. Recommencez depuis le studio.",
      );
    if (url.searchParams.has("error"))
      return ctx.redirect(
        claim.next_path +
          (claim.next_path.includes("?") ? "&" : "?") +
          "github=cancelled",
      );
    // Setup/update callbacks carry an installation id without an OAuth code.
    // Start user authorization with a fresh single-use state retaining that id.
    if (!url.searchParams.get("code")) {
      const installation = numericId.parse(
        url.searchParams.get("installation_id"),
      );
      const nextState = crypto.randomUUID() + crypto.randomUUID();
      const { error: stateError } = await db
        .from("github_oauth_states")
        .insert({
          state_hash: await hashState(nextState),
          seller_id: seller,
          origin: siteOrigin(c, req),
          next_path: claim.next_path,
          installation_id: installation,
          expires_at: new Date(Date.now() + 600000).toISOString(),
        });
      check(stateError);
      ctx.cookies.push(
        `mp-github-state=${nextState}; Path=/api/github/callback; HttpOnly; SameSite=Lax; Max-Age=600${url.protocol === "https:" ? "; Secure" : ""}`,
      );
      const authorization = new URL("https://github.com/login/oauth/authorize");
      authorization.searchParams.set("client_id", c.GITHUB_APP_CLIENT_ID!);
      authorization.searchParams.set(
        "redirect_uri",
        siteOrigin(c, req) + "/api/github/callback",
      );
      authorization.searchParams.set("state", nextState);
      return ctx.redirect(authorization.href);
    }
    const code = z.string().min(1).max(500).parse(url.searchParams.get("code"));
    const installation = numericId.parse(
      claim.installation_id || url.searchParams.get("installation_id"),
    );
    let response: Response;
    try {
      response = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(20000),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: c.GITHUB_APP_CLIENT_ID,
          client_secret: c.GITHUB_APP_CLIENT_SECRET,
          code,
          redirect_uri: siteOrigin(c, req) + "/api/github/callback",
        }),
      });
    } catch {
      throw new GitHubError(503);
    }
    const auth = (await response.json()) as { access_token?: string };
    if (!response.ok || !auth.access_token)
      throw new HttpError(403, "L’autorisation GitHub a échoué. Recommencez.");
    // Never trust installation_id from the browser. Check app ownership and the user's repository admin rights with their OAuth token.
    const installationInfo = (await (
      await githubRequest(`/app/installations/${installation}`, await appJwt(c))
    ).json()) as { app_id: number; account: { login: string } };
    if (String(installationInfo.app_id) !== c.GITHUB_APP_ID)
      throw new HttpError(403, "Installation GitHub invalide.");
    const repositories = await listUserRepositories(
      auth.access_token,
      installation,
    );
    if (!repositories.length)
      throw new HttpError(
        403,
        "Autorisez au moins un dépôt de distribution que vous administrez.",
      );
    const { error: saveError } = await db.from("github_connections").upsert(
      {
        seller_id: seller,
        installation_id: installation,
        account_login: installationInfo.account.login,
        repositories: repositories.map((r) => ({
          id: r.id,
          name: r.name,
          full_name: r.full_name,
          owner: { login: r.owner.login },
        })),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "seller_id,installation_id" },
    );
    check(saveError);
    // OAuth tokens only live in this request; only numeric references and repository metadata are persisted.
    return ctx.redirect(
      claim.next_path +
        (claim.next_path.includes("?") ? "&" : "?") +
        "github=connected",
    );
  }
  if (route === "github/repositories" && req.method === "GET") {
    const { data, error } = await db
      .from("github_connections")
      .select("installation_id,repositories")
      .eq("seller_id", seller);
    check(error);
    return ctx.json({
      repositories: (data || []).flatMap((row) =>
        (row.repositories as Repository[]).map((r) => ({
          id: r.id,
          full_name: r.full_name,
          installation_id: row.installation_id,
        })),
      ),
    });
  }
  if (route === "github/releases" && req.method === "GET") {
    const installation = numericId.parse(
      url.searchParams.get("installation_id"),
    );
    const repository = numericId.parse(url.searchParams.get("repository_id"));
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .parse(url.searchParams.get("page") || "1");
    await permittedRepository(db, seller, installation, repository);
    const token = await installationToken(c, installation, repository);
    const repo = (await (
      await githubRequest(`/repositories/${repository}`, token)
    ).json()) as Repository;
    const releases = (await (
      await githubRequest(
        `/repos/${encodeURIComponent(repo.owner.login)}/${encodeURIComponent(repo.name)}/releases?per_page=30&page=${page}`,
        token,
      )
    ).json()) as Array<{
      id: number;
      tag_name: string;
      draft: boolean;
      immutable?: boolean;
      assets: Array<{
        id: number;
        name: string;
        size: number;
        digest?: string;
        state: string;
      }>;
    }>;
    return ctx.json({
      more: releases.length === 30,
      releases: releases
        .filter((r) => !r.draft)
        .map((r) => ({
          id: r.id,
          tag: r.tag_name,
          immutable: !!r.immutable,
          assets: r.assets
            .filter(
              (a) =>
                a.state === "uploaded" &&
                /\.(zip|json)$/i.test(a.name) &&
                a.size > 0 &&
                a.size < 2147483648 &&
                /^sha256:[a-f0-9]{64}$/.test(a.digest || ""),
            )
            .map((a) => ({ id: a.id, name: a.name, size: a.size })),
        })),
    });
  }
  throw new HttpError(404, "Page introuvable.");
}
export async function attachGitHubFile(
  req: Request,
  c: Config,
  db: Db,
  seller: string,
  product: { id: string; version: string; status: string },
) {
  if (!["draft", "rejected"].includes(product.status))
    throw new HttpError(
      409,
      "Enregistrez un brouillon avant de remplacer son fichier.",
    );
  const selection = githubSelection.parse(await req.json());
  await permittedRepository(
    db,
    seller,
    selection.installation_id,
    selection.repository_id,
  );
  const { source } = await selectedSource(c, selection);
  const { error } = await db.rpc("market_attach_github_file", {
    p_id: product.id,
    p_seller: seller,
    p_version: product.version,
    p_source: source,
  });
  if (error)
    throw new HttpError(
      409,
      "Le produit a changé. Enregistrez le brouillon et recommencez.",
    );
  return { ok: true, name: source.asset_name, sha256: source.sha256 };
}
export async function githubWebhook(req: Request, c: Config, db: Db) {
  const event = await verifyWebhook(req, c);
  const kind = req.headers.get("x-github-event");
  if (kind === "ping") return Response.json({ ok: true });
  const installation = numericId.parse(event.installation?.id);
  const invalidate = async (
    repository: number | null,
    release: number | null = null,
    asset: number | null = null,
  ) => {
    const { error } = await db.rpc("market_github_invalidate", {
      p_installation: installation,
      p_repository: repository,
      p_release: release,
      p_asset: asset,
    });
    check(error);
  };
  if (
    kind === "installation" &&
    ["deleted", "suspend"].includes(event.action)
  ) {
    await invalidate(null);
    const { error } = await db
      .from("github_connections")
      .delete()
      .eq("installation_id", installation);
    check(error);
  } else if (
    kind === "installation_repositories" &&
    event.action === "removed"
  ) {
    for (const repo of event.repositories_removed || [])
      await invalidate(numericId.parse(repo.id));
  } else if (kind === "release" && event.action === "deleted") {
    await invalidate(
      numericId.parse(event.repository?.id),
      numericId.parse(event.release?.id),
    );
  } else if (kind === "release_asset" && event.action === "deleted") {
    await invalidate(
      numericId.parse(event.repository?.id),
      null,
      numericId.parse(event.release_asset?.id),
    );
  } else if (kind === "repository" && event.action === "deleted") {
    await invalidate(numericId.parse(event.repository?.id));
  }
  return Response.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
