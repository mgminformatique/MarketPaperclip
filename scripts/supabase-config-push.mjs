// Push supabase/config.toml to the MarketPaperclip project with the private
// Send Email hook secret. Never push this config without that secret: the
// hook would lose its signature and every authentication email would fail.
//   node scripts/supabase-config-push.mjs            (diff, then push)
//   node scripts/supabase-config-push.mjs --diff     (diff only)
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PROJECT_REF = "ltommtumsvvqxdknpkfd";
const root = fileURLToPath(new URL("../", import.meta.url));
let secret = process.env.SEND_EMAIL_HOOK_SECRET;
if (!secret) {
  try {
    secret = /^SEND_EMAIL_HOOK_SECRET=(.+)$/m.exec(
      readFileSync(new URL("../.sites-runtime/send-email-hook.private.env", import.meta.url), "utf8"),
    )?.[1];
  } catch {
    // No private file yet: reported below.
  }
}
if (!secret?.startsWith("v1,whsec_")) {
  console.error("Secret du crochet introuvable : lance d’abord scripts/setup-microsoft-mailer.mjs --apply.");
  process.exit(2);
}
const env = { ...process.env, SEND_EMAIL_HOOK_SECRET: secret };
const run = (args) => spawnSync("supabase", args, { cwd: root, env, stdio: "inherit" }).status ?? 1;
if (run(["config", "diff", "--project-ref", PROJECT_REF]) !== 0) process.exit(1);
if (process.argv.includes("--diff")) process.exit(0);
process.exit(run(["config", "push", "--project-ref", PROJECT_REF, "--yes"]));
