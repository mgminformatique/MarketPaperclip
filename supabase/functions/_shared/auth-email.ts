// Supabase Auth "Send Email" hook for MarketPaperclip. Every request must
// carry a valid Standard Webhooks signature; messages (French, then English)
// keep the look of supabase/templates and are sent from the MGM Microsoft 365
// mailbox through Microsoft Graph (application permission Mail.Send).
// No password or SMTP credential is involved.
export type MailerEnv = {
  SEND_EMAIL_HOOK_SECRET?: string;
  MS_TENANT_ID?: string;
  MS_CLIENT_ID?: string;
  MS_CLIENT_SECRET?: string;
  MAIL_FROM?: string;
  // Origin used when a request carries no allowed return address.
  SITE_URL?: string;
};
type Dependencies = { fetcher?: typeof fetch; now?: () => number };
export type HookUser = { id?: string; email?: string; new_email?: string };
export type EmailData = {
  token?: string;
  token_hash?: string;
  redirect_to?: string;
  email_action_type?: string;
  site_url?: string;
  token_new?: string;
  token_hash_new?: string;
  old_email?: string;
};
export type OutgoingMail = { to: string; subject: string; html: string };

export class HookError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const TOLERANCE_SECONDS = 5 * 60;
const BODY_LIMIT = 64 * 1024;
const EMAIL = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,253}$/;
export const DEFAULT_SITE = "https://marketpaperclip.com";
// Origins serving this same marketplace (Netlify deploy previews included).
const ORIGINS = new Set([
  "https://marketpaperclip.com",
  "https://www.marketpaperclip.com",
  "https://marketpaperclip.netlify.app",
]);
const PREVIEW = /^https:\/\/[a-z0-9-]+--marketpaperclip\.netlify\.app$/;

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function sameText(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Standard Webhooks v1 (HMAC-SHA256 over "id.timestamp.body"). */
export async function verifyHookSignature(
  raw: string,
  headers: Headers,
  secret: string,
  now = Date.now(),
): Promise<void> {
  const id = headers.get("webhook-id"),
    timestamp = headers.get("webhook-timestamp"),
    signatures = headers.get("webhook-signature");
  if (!id || !timestamp || !signatures)
    throw new HookError(401, "Signature du crochet manquante.");
  const seconds = Number(timestamp);
  if (
    !/^\d{1,12}$/.test(timestamp) ||
    Math.abs(now / 1000 - seconds) > TOLERANCE_SECONDS
  )
    throw new HookError(401, "Signature du crochet expirée.");
  let key: Uint8Array;
  try {
    key = base64ToBytes(secret.replace(/^v1,/, "").replace(/^whsec_/, ""));
  } catch {
    throw new HookError(500, "Secret du crochet invalide.");
  }
  if (key.length < 16) throw new HookError(500, "Secret du crochet invalide.");
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = bytesToBase64(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        cryptoKey,
        new TextEncoder().encode(`${id}.${timestamp}.${raw}`),
      ),
    ),
  );
  const valid = signatures.split(" ").some((entry) => {
    const [version, value] = entry.split(",");
    return version === "v1" && !!value && sameText(value, expected);
  });
  if (!valid) throw new HookError(401, "Signature du crochet invalide.");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Keep the visitor on the marketplace origin they used; anything else falls back. */
export function linkOrigin(data: EmailData, fallback = DEFAULT_SITE) {
  for (const candidate of [data.redirect_to, data.site_url]) {
    if (!candidate) continue;
    try {
      const origin = new URL(candidate).origin;
      if (ORIGINS.has(origin) || PREVIEW.test(origin)) return origin;
    } catch {
      // Not a URL: try the next candidate.
    }
  }
  return fallback;
}
/** Same link as supabase/templates: the server callback verifies the token hash. */
export function callbackUrl(origin: string, tokenHash: string, type: string) {
  const url = new URL("/api/auth/callback", origin);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", type);
  return url.href;
}

type Content = {
  subject: string;
  title: string;
  fr: string[];
  en: string[];
  action?: { label: string; href: string };
  code?: string;
  ignore?: [string, string];
};
const IGNORE: [string, string] = [
  "Si vous n’êtes pas à l’origine de cette demande, ignorez ce courriel.",
  "If you did not request this, you can ignore this email.",
];
function layout(content: Content) {
  const fr = content.fr.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
  const en = content.en
    .map((line) => `<p lang="en" style="color:#b3bfad">${escapeHtml(line)}</p>`)
    .join("");
  const code = content.code
    ? `<p style="margin:28px 0;font-size:30px;font-weight:bold;letter-spacing:6px;color:#c9fa72">${escapeHtml(content.code)}</p>`
    : "";
  const action = content.action
    ? `<p style="margin:32px 0"><a href="${escapeHtml(content.action.href)}" style="display:inline-block;background:#c9fa72;color:#17200e;padding:14px 22px;border-radius:8px;text-decoration:none;font-weight:bold">${escapeHtml(content.action.label)}</a></p>
<p style="font-size:12px;color:#b3bfad">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur.<br><span lang="en">If the button does not work, copy this link into your browser.</span><br><a href="${escapeHtml(content.action.href)}" style="color:#c9fa72;word-break:break-all">${escapeHtml(content.action.href)}</a></p>`
    : "";
  const [ignoreFr, ignoreEn] = content.ignore ?? IGNORE;
  return `<!doctype html>
<html lang="fr">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(content.subject)}</title></head>
  <body style="margin:0;padding:32px;background:#0d1010;color:#eef2eb;font-family:Arial,sans-serif">
    <div style="max-width:540px;margin:auto;padding:32px;background:#151b17;border:1px solid #34412f;border-radius:16px">
      <p style="color:#c9fa72;font-size:13px;letter-spacing:2px">MARKETPAPERCLIP</p>
      <h1 style="font-size:26px">${escapeHtml(content.title)}</h1>
      ${fr}${en}${code}${action}
      <p style="font-size:12px;color:#b3bfad">${escapeHtml(ignoreFr)}<br><span lang="en">${escapeHtml(ignoreEn)}</span></p>
    </div>
  </body>
</html>`;
}

function mail(to: string | undefined, content: Content): OutgoingMail[] {
  if (!to || !EMAIL.test(to)) return [];
  return [{ to, subject: content.subject, html: layout(content) }];
}

/** Messages for one hook call (two for a secure email change). */
export function buildMessages(
  user: HookUser,
  data: EmailData,
  site = DEFAULT_SITE,
): OutgoingMail[] {
  const type = data.email_action_type ?? "";
  const origin = linkOrigin(data, site);
  const link = (hash: string | undefined, kind = type) => {
    if (!hash) throw new HookError(400, "Jeton de vérification manquant.");
    return callbackUrl(origin, hash, kind);
  };
  switch (type) {
    case "signup":
      return mail(user.email, {
        subject: "MarketPaperclip — Confirmez votre compte / Confirm your account",
        title: "Bienvenue dans le marketplace.",
        fr: ["Confirmez votre adresse courriel pour activer votre compte."],
        en: ["Confirm your email address to activate your account."],
        action: { label: "Confirmer / Confirm", href: link(data.token_hash) },
        ignore: [
          "Si vous n’avez pas créé de compte, ignorez ce courriel.",
          "If you did not create an account, you can ignore this email.",
        ],
      });
    case "recovery":
      return mail(user.email, {
        subject: "MarketPaperclip — Nouveau mot de passe / Reset password",
        title: "Un nouveau mot de passe.",
        fr: ["Suivez ce lien pour choisir un nouveau mot de passe."],
        en: ["Follow this link to choose a new password."],
        action: { label: "Réinitialiser / Reset password", href: link(data.token_hash) },
        ignore: [
          "Si vous n’avez pas fait cette demande, ignorez ce courriel.",
          "If you did not request a password reset, you can ignore this email.",
        ],
      });
    case "magiclink":
      return mail(user.email, {
        subject: "MarketPaperclip — Votre lien de connexion / Your sign-in link",
        title: "Connexion au marketplace.",
        fr: ["Utilisez ce lien pour vous connecter à votre compte."],
        en: ["Use this link to sign in to your account."],
        action: { label: "Me connecter / Sign in", href: link(data.token_hash) },
      });
    case "invite":
      return mail(user.email, {
        subject: "MarketPaperclip — Invitation / You are invited",
        title: "Vous êtes invité.",
        fr: ["Vous êtes invité à rejoindre MarketPaperclip, le marketplace d’agents IA."],
        en: ["You are invited to join MarketPaperclip, the AI agent marketplace."],
        action: { label: "Accepter / Accept", href: link(data.token_hash) },
      });
    case "email_change": {
      // Supabase names these hashes in reverse for backward compatibility:
      // token_hash_new confirms the current address, token_hash the new one.
      const messages: OutgoingMail[] = [];
      if (data.token_hash_new && user.new_email)
        messages.push(
          ...mail(user.email, {
            subject: "MarketPaperclip — Changement d’adresse / Email change",
            title: "Changement d’adresse courriel.",
            fr: [`Confirmez que votre compte utilisera désormais l’adresse ${user.new_email}.`],
            en: [`Confirm that your account will now use ${user.new_email}.`],
            action: { label: "Confirmer / Confirm", href: link(data.token_hash_new) },
          }),
        );
      messages.push(
        ...mail(user.new_email ?? user.email, {
          subject: "MarketPaperclip — Confirmez votre nouvelle adresse / Confirm your new email",
          title: "Confirmez votre nouvelle adresse.",
          fr: ["Confirmez cette adresse pour l’utiliser avec MarketPaperclip."],
          en: ["Confirm this address to use it with MarketPaperclip."],
          action: {
            label: "Confirmer / Confirm",
            href: link(data.token_hash ?? data.token_hash_new),
          },
        }),
      );
      return messages;
    }
    case "email":
    case "reauthentication":
      return mail(user.email, {
        subject: "MarketPaperclip — Code de vérification / Verification code",
        title: "Votre code de vérification.",
        fr: ["Saisissez ce code dans MarketPaperclip pour continuer."],
        en: ["Enter this code in MarketPaperclip to continue."],
        code: data.token,
      });
    case "mgm_test":
      // Sent by scripts/setup-microsoft-mailer.mjs --test-to (signed like Auth).
      return mail(user.email, {
        subject: "MarketPaperclip — Courriel de test / Test email",
        title: "Les courriels sont branchés.",
        fr: ["Les courriels de MarketPaperclip partent maintenant de Microsoft 365. Aucune action n’est requise."],
        en: ["MarketPaperclip emails are now sent through Microsoft 365. No action is needed."],
        ignore: [
          "Courriel envoyé par la configuration de MarketPaperclip.",
          "Sent while configuring MarketPaperclip.",
        ],
      });
    case "password_changed_notification":
      return mail(user.email, {
        subject: "MarketPaperclip — Mot de passe modifié / Password changed",
        title: "Mot de passe modifié.",
        fr: [
          "Le mot de passe de votre compte vient d’être modifié.",
          "Si ce n’est pas vous, réinitialisez-le immédiatement depuis la page de connexion.",
        ],
        en: [
          "The password of your account was just changed.",
          "If this was not you, reset it right away from the sign-in page.",
        ],
      });
    case "email_changed_notification":
      return mail(data.old_email ?? user.email, {
        subject: "MarketPaperclip — Adresse modifiée / Email changed",
        title: "Adresse courriel modifiée.",
        fr: [
          `Votre compte utilise maintenant l’adresse ${user.email ?? ""}.`,
          "Si ce n’est pas vous, écrivez à info@mgminformatique.ca.",
        ],
        en: [
          `Your account now uses ${user.email ?? ""}.`,
          "If this was not you, write to info@mgminformatique.ca.",
        ],
      });
    default:
      if (/_notification$/.test(type))
        return mail(user.email, {
          subject: "MarketPaperclip — Activité de sécurité / Security activity",
          title: "Activité de sécurité.",
          fr: [
            "Un réglage de sécurité de votre compte vient d’être modifié.",
            "Si ce n’est pas vous, réinitialisez votre mot de passe depuis la page de connexion.",
          ],
          en: [
            "A security setting of your account was just changed.",
            "If this was not you, reset your password from the sign-in page.",
          ],
        });
      throw new HookError(400, "Type de courriel non pris en charge.");
  }
}

let cachedToken: { value: string; expires: number; key: string } | null = null;
async function graphToken(env: MailerEnv, fetcher: typeof fetch, now: number) {
  const key = `${env.MS_TENANT_ID}:${env.MS_CLIENT_ID}`;
  if (cachedToken && cachedToken.key === key && cachedToken.expires > now + 60_000)
    return cachedToken.value;
  const response = await fetcher(
    `https://login.microsoftonline.com/${encodeURIComponent(env.MS_TENANT_ID!)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.MS_CLIENT_ID!,
        client_secret: env.MS_CLIENT_SECRET!,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }).toString(),
    },
  );
  const body = (await response.json().catch(() => null)) as {
    access_token?: unknown;
    expires_in?: unknown;
  } | null;
  if (!response.ok || !body || typeof body.access_token !== "string")
    throw new HookError(502, "Le service d’envoi Microsoft est indisponible.");
  cachedToken = {
    value: body.access_token,
    expires: now + Number(body.expires_in ?? 3000) * 1000,
    key,
  };
  return cachedToken.value;
}
export function resetMailerCache() {
  cachedToken = null;
}
async function send(
  env: MailerEnv,
  message: OutgoingMail,
  fetcher: typeof fetch,
  now: number,
) {
  const token = await graphToken(env, fetcher, now);
  const response = await fetcher(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env.MAIL_FROM!)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject: message.subject,
          body: { contentType: "HTML", content: message.html },
          toRecipients: [{ emailAddress: { address: message.to } }],
        },
        saveToSentItems: false,
      }),
    },
  );
  if (response.status !== 202) {
    if (response.status === 401) cachedToken = null;
    throw new HookError(502, "L’envoi du courriel par Microsoft a échoué.");
  }
}
function configured(env: MailerEnv) {
  return !!(
    env.SEND_EMAIL_HOOK_SECRET &&
    env.MS_TENANT_ID &&
    env.MS_CLIENT_ID &&
    env.MS_CLIENT_SECRET &&
    env.MAIL_FROM &&
    EMAIL.test(env.MAIL_FROM)
  );
}
function reply(status: number, message?: string) {
  return new Response(
    JSON.stringify(message ? { error: { http_code: status, message } } : {}),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}
export async function handleAuthEmail(
  request: Request,
  env: MailerEnv,
  dependencies: Dependencies = {},
): Promise<Response> {
  if (request.method !== "POST") return reply(405, "Méthode non permise.");
  if (!configured(env))
    return reply(503, "Le service d’envoi des courriels n’est pas configuré.");
  const now = dependencies.now?.() ?? Date.now();
  try {
    if (Number(request.headers.get("content-length") ?? 0) > BODY_LIMIT)
      throw new HookError(413, "Requête trop volumineuse.");
    const raw = await request.text();
    if (raw.length > BODY_LIMIT)
      throw new HookError(413, "Requête trop volumineuse.");
    await verifyHookSignature(raw, request.headers, env.SEND_EMAIL_HOOK_SECRET!, now);
    let payload: { user?: HookUser; email_data?: EmailData };
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new HookError(400, "Requête JSON invalide.");
    }
    if (!payload?.user || !payload?.email_data)
      throw new HookError(400, "Requête incomplète.");
    const site = env.SITE_URL && /^https:\/\//.test(env.SITE_URL) ? new URL(env.SITE_URL).origin : DEFAULT_SITE;
    const messages = buildMessages(payload.user, payload.email_data, site);
    if (!messages.length) throw new HookError(400, "Adresse courriel invalide.");
    const fetcher = dependencies.fetcher ?? fetch;
    for (const message of messages) await send(env, message, fetcher, now);
    return reply(200);
  } catch (error) {
    if (error instanceof HookError) return reply(error.status, error.message);
    // Never echo upstream bodies, tokens or recipient details.
    return reply(500, "Le courriel n’a pas pu être envoyé.");
  }
}
