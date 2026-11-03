// Configure MarketPaperclip authentication emails through Microsoft 365
// (same method as ChantierConnect).
//
//   mgm exec microsoft -- node scripts/setup-microsoft-mailer.mjs            (plan only)
//   mgm exec microsoft -- node scripts/setup-microsoft-mailer.mjs --apply    (create/rotate)
//   … --apply --test-to info@mgminformatique.ca                              (+ test email)
//
// MS_GRAPH_TOKEN (delegated, admin) and MS_TENANT_ID are injected by MGM
// Mission Control. The script creates or reuses the Entra application
// "MarketPaperclip Courriels" with the Graph application permission Mail.Send,
// grants admin consent, creates a client secret, stores it with a new Standard
// Webhooks secret in the secrets of the Supabase function send-email, sends a
// signed test email when asked, then enables the Supabase Auth Send Email hook.
// Secrets go straight to Supabase and are never printed.
import { spawnSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_REF = "ltommtumsvvqxdknpkfd";
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const HOOK_URI = `${SUPABASE_URL}/functions/v1/send-email`;
const SITE_URL = "https://marketpaperclip.com";
const APP_NAME = "MarketPaperclip Courriels";
const MAIL_FROM = process.env.MAIL_FROM || "info@mgminformatique.ca";
const GRAPH_APP_ID = "00000003-0000-0000-c000-000000000000";
const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const testTo = args.includes("--test-to") ? args[args.indexOf("--test-to") + 1] : "";

const token = process.env.MS_GRAPH_TOKEN;
const tenant = process.env.MS_TENANT_ID;
if (!token || !tenant) {
  console.error("Lance ce script avec « mgm exec microsoft -- node scripts/setup-microsoft-mailer.mjs ».");
  process.exit(2);
}
if (testTo && !/^[^\s@<>"]{1,64}@[^\s@<>"]{1,253}$/.test(testTo)) {
  console.error("Adresse de test invalide.");
  process.exit(2);
}
async function graph(pathname, method = "GET", body) {
  const response = await fetch("https://graph.microsoft.com/v1.0" + pathname, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      ConsistencyLevel: "eventual",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const code = data?.error?.code || "HTTP " + response.status;
    throw new Error(`Microsoft Graph ${method} ${pathname.split("?")[0]} : ${code} — ${data?.error?.message ?? ""}`.slice(0, 300));
  }
  return data;
}
function step(text) {
  console.log("• " + text);
}
// Entra replicates a new application for a few seconds: retry the calls that
// depend on it instead of failing on a transient "not a valid application".
async function settled(call, attempts = 12) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await call();
    } catch (error) {
      if (attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

const me = await graph("/me?$select=userPrincipalName");
step(`Connecté à Microsoft 365 : ${me.userPrincipalName} (locataire ${tenant})`);
const mailbox = await graph(`/users/${encodeURIComponent(MAIL_FROM)}?$select=id,mail,userPrincipalName`);
step(`Boîte d’envoi trouvée : ${mailbox.mail || mailbox.userPrincipalName}`);
const graphSp = (await graph(`/servicePrincipals?$filter=appId eq '${GRAPH_APP_ID}'&$select=id,appRoles`)).value[0];
const mailSend = graphSp.appRoles.find((role) => role.value === "Mail.Send" && role.allowedMemberTypes.includes("Application"));
if (!mailSend) throw new Error("Permission Mail.Send introuvable dans Microsoft Graph.");

let app = (await graph(`/applications?$filter=displayName eq '${APP_NAME}'&$select=id,appId,displayName,passwordCredentials`)).value[0];
step(app ? `Application existante : ${APP_NAME} (${app.appId})` : `Application à créer : ${APP_NAME}`);
if (!apply) {
  console.log("\nPlan seulement. Ajoute --apply pour créer/renouveler le secret et activer les courriels.");
  process.exit(0);
}
if (!app) {
  app = await graph("/applications", "POST", {
    displayName: APP_NAME,
    signInAudience: "AzureADMyOrg",
    notes: `Courriels d’authentification MarketPaperclip envoyés depuis ${MAIL_FROM} par la fonction Supabase send-email.`,
    requiredResourceAccess: [
      { resourceAppId: GRAPH_APP_ID, resourceAccess: [{ id: mailSend.id, type: "Role" }] },
    ],
  });
  step(`Application créée (${app.appId})`);
}
let sp = (await graph(`/servicePrincipals?$filter=appId eq '${app.appId}'&$select=id`)).value[0];
if (!sp) {
  sp = await settled(() => graph("/servicePrincipals", "POST", { appId: app.appId }));
  step("Principal de service créé");
}
const assignments = (await settled(() => graph(`/servicePrincipals/${sp.id}/appRoleAssignments`))).value;
if (!assignments.some((a) => a.appRoleId === mailSend.id && a.resourceId === graphSp.id)) {
  await settled(() =>
    graph(`/servicePrincipals/${sp.id}/appRoleAssignments`, "POST", {
      principalId: sp.id,
      resourceId: graphSp.id,
      appRoleId: mailSend.id,
    }),
  );
  step("Consentement administrateur accordé pour Mail.Send (application)");
} else step("Consentement Mail.Send déjà accordé");

const expires = new Date();
expires.setMonth(expires.getMonth() + 24);
const credential = await settled(() =>
  graph(`/applications/${app.id}/addPassword`, "POST", {
    passwordCredential: {
      displayName: "Supabase send-email " + new Date().toISOString().slice(0, 10),
      endDateTime: expires.toISOString(),
    },
  }),
);
step(`Secret client créé (expire le ${expires.toISOString().slice(0, 10)}) — non affiché`);
const hookSecret = "v1,whsec_" + randomBytes(32).toString("base64");

// Secrets reach Supabase through a private temporary file, then it is removed.
const folder = mkdtempSync(path.join(tmpdir(), "mp-mailer-"));
const envFile = path.join(folder, "secrets.env");
try {
  writeFileSync(
    envFile,
    [
      `MS_TENANT_ID=${tenant}`,
      `MS_CLIENT_ID=${app.appId}`,
      `MS_CLIENT_SECRET=${credential.secretText}`,
      `MAIL_FROM=${MAIL_FROM}`,
      `SITE_URL=${SITE_URL}`,
      `SEND_EMAIL_HOOK_SECRET=${hookSecret}`,
    ].join("\n") + "\n",
    { mode: 0o600 },
  );
  const secrets = spawnSync("supabase", ["secrets", "set", "--project-ref", PROJECT_REF, "--env-file", envFile], {
    cwd: root,
    encoding: "utf8",
  });
  if (secrets.status !== 0) throw new Error("supabase secrets set a échoué.");
  step("Secrets de la fonction send-email enregistrés dans Supabase");
} finally {
  rmSync(folder, { recursive: true, force: true });
}
// Keep the signing secret privately for later Auth config pushes
// (scripts/supabase-config-push.mjs).
const runtime = path.join(root, ".sites-runtime");
mkdirSync(runtime, { recursive: true, mode: 0o700 });
writeFileSync(path.join(runtime, "send-email-hook.private.env"), `SEND_EMAIL_HOOK_SECRET=${hookSecret}\n`, { mode: 0o600 });

// Microsoft can take a few seconds to accept a brand-new client secret.
async function graphAppToken() {
  for (let attempt = 0; attempt < 12; attempt++) {
    const response = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: app.appId,
        client_secret: credential.secretText,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    });
    if (response.ok) return true;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  return false;
}
step((await graphAppToken()) ? "Jeton d’application Microsoft obtenu" : "Le secret n’est pas encore actif chez Microsoft (réessaie dans une minute)");

if (testTo) {
  const body = JSON.stringify({
    user: { id: "00000000-0000-4000-8000-000000000000", email: testTo },
    email_data: {
      token: "",
      token_hash: "",
      redirect_to: SITE_URL,
      email_action_type: "mgm_test",
      site_url: SITE_URL,
      token_new: "",
      token_hash_new: "",
    },
  });
  const id = "msg_" + randomBytes(8).toString("hex");
  let status = 0;
  // Function secrets and Graph permissions take a moment to propagate.
  for (let attempt = 0; attempt < 8 && status !== 200; attempt++) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 10000));
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", Buffer.from(hookSecret.slice("v1,whsec_".length), "base64"))
      .update(`${id}.${timestamp}.${body}`)
      .digest("base64");
    const response = await fetch(HOOK_URI, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "webhook-id": id,
        "webhook-timestamp": timestamp,
        "webhook-signature": "v1," + signature,
      },
      body,
    });
    status = response.status;
  }
  if (status !== 200) {
    console.error(`Courriel de test refusé (HTTP ${status}) : le crochet n’est pas activé. Relance le script avec --apply.`);
    process.exit(1);
  }
  step(`Courriel de test envoyé à ${testTo}`);
}

const push = spawnSync("node", [path.join(root, "scripts/supabase-config-push.mjs")], {
  cwd: root,
  encoding: "utf8",
});
if (push.status !== 0) {
  console.error("supabase config push a échoué; le crochet n’est pas activé.");
  process.exit(1);
}
step("Crochet Supabase Auth « Send Email » activé : les courriels partent de " + MAIL_FROM);
