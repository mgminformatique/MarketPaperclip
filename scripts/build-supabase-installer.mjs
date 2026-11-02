import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const versions = ["001", "002", "003", "004", "005", "006"];
const tables = ["profiles", "market_admins", "seller_accounts", "products", "product_files", "orders", "favorites", "reviews", "support_requests", "stripe_events", "audit_log", "rate_limits"];
const sqlString = (value) => "'" + value.replaceAll("'", "''") + "'";

export async function buildInstaller(migrationDirectory = resolve(root, "supabase/migrations")) {
  const files = (await readdir(migrationDirectory)).filter((name) => name.endsWith(".sql")).sort();
  if (files.map((name) => name.split("_")[0]).join(",") !== versions.join(",")) {
    throw new Error("Review the installer before changing its six-migration baseline.");
  }
  const migrations = [];
  for (const name of files) {
    const source = await readFile(resolve(migrationDirectory, name), "utf8");
    const transactions = source.match(/^\s*(?:begin|commit|rollback)\s*;\s*$/gmi) || [];
    if (transactions.length !== 2 || !/^\s*begin/i.test(transactions[0]) || !/^\s*commit/i.test(transactions[1])) {
      throw new Error(`Unexpected transaction boundaries in ${name}.`);
    }
    const body = source.replace(/^\s*begin\s*;\s*$/mi, "").replace(/^\s*commit\s*;\s*$/mi, "").trim();
    const version = name.split("_")[0];
    const migrationName = name.slice(version.length + 1, -4);
    const delimiter = `$marketpaperclip_${version}$`;
    if (body.includes(delimiter)) throw new Error(`Unexpected SQL delimiter in ${name}.`);
    migrations.push(`-- ${name}\n${body}\n\ninsert into supabase_migrations.schema_migrations(version, name, statements)\nvalues (${sqlString(version)}, ${sqlString(migrationName)}, array[${delimiter}${body}${delimiter}]);`);
  }
  const tableList = tables.map(sqlString).join(", ");
  const sql = `-- MarketPaperclip: initial database installation.
-- TARGET: ltommtumsvvqxdknpkfd ONLY.
-- Open https://supabase.com/dashboard/project/ltommtumsvvqxdknpkfd/sql/new
-- Run this entire file as postgres. It contains no credentials.
-- All six migrations and their history commit together or roll back together.
-- An existing application schema stops installation; nothing is reset.
-- Auth URL/email settings are a separate Dashboard step (see docs/SUPABASE-DASHBOARD.md).

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select pg_advisory_xact_lock(hashtext('marketpaperclip:initial-install'));

do $marketpaperclip_guard$
begin
  if current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Run the installer as postgres in the Supabase SQL Editor.';
  end if;
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
    and not exists (select 1 from pg_depend d where d.objid = c.oid and d.classid = 'pg_class'::regclass and d.deptype = 'e')
  ) then
    raise exception 'Public application tables already exist. Stop and reconcile migrations; do not reset the database.';
  end if;
end;
$marketpaperclip_guard$;

create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key);
alter table supabase_migrations.schema_migrations add column if not exists statements text[];
alter table supabase_migrations.schema_migrations add column if not exists name text;
do $marketpaperclip_history$
begin
  if exists (select 1 from supabase_migrations.schema_migrations) then
    raise exception 'Migration history already exists. Reconcile it before initial installation.';
  end if;
end;
$marketpaperclip_history$;

${migrations.join("\n\n")}

do $marketpaperclip_verify$
begin
  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname in (${tableList}) and c.relrowsecurity) <> ${tables.length} then
    raise exception 'Expected marketplace tables and RLS are incomplete. Installation rolled back.';
  end if;
  if (select count(*) from supabase_migrations.schema_migrations where version in (${versions.map(sqlString).join(", ")})) <> ${versions.length} then
    raise exception 'Migration history is incomplete. Installation rolled back.';
  end if;
  if not exists (select 1 from storage.buckets where id = 'agent-packages' and public = false and file_size_limit = 20971520)
     or not exists (select 1 from storage.buckets where id = 'product-covers' and public = true and file_size_limit = 3145728) then
    raise exception 'Storage configuration does not match the marketplace. Installation rolled back.';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (p.proname like 'market_%' or p.proname = 'create_market_profile')
    and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  ) then
    raise exception 'A server-only function is exposed to a client role. Installation rolled back.';
  end if;
end;
$marketpaperclip_verify$;
notify pgrst, 'reload schema';
commit;

select 'MarketPaperclip: database installation complete' as status,
       (select count(*) from supabase_migrations.schema_migrations) as migrations,
       (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname in (${tableList}) and c.relrowsecurity) as tables_with_rls;
`;
  // Some dashboard/query adapters display the first SELECT result in a batch.
  // Send one atomic statement so no intermediate lock result can look like
  // a successful installation and no explicit transaction can remain open.
  const wrapped = sql.match(/^([\s\S]*?)\nbegin;\n([\s\S]*)\ncommit;\n\nselect 'MarketPaperclip: database installation complete'[\s\S]*$/);
  if (!wrapped) throw new Error("Installer transaction boundaries changed; review the wrapper.");
  const payloadTag = "$marketpaperclip_payload$";
  const blockTag = "$marketpaperclip_install$";
  if (sql.includes(payloadTag) || sql.includes(blockTag)) throw new Error("Installer delimiter collision.");
  return `${wrapped[1]}
-- One top-level command: PostgreSQL commits it automatically only after every check succeeds.
-- Expected Dashboard result: Success. No rows returned.
do ${blockTag}
begin
  execute ${payloadTag}
${wrapped[2]}
${payloadTag};
  raise notice 'MarketPaperclip: installation complete; 6 migrations, 12 tables with RLS.';
end;
${blockTag};
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = resolve(root, "supabase/INSTALL-MARKETPAPERCLIP.sql");
  const sql = await buildInstaller(process.argv[2] ? resolve(process.argv[2]) : undefined);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, sql);
  console.log(`Prepared ${output}; no remote SQL has been executed.`);
}
