import { test } from "node:test";
import assert from "node:assert/strict";
import { runCrossCheck, siteFromFiles } from "../../../test/helpers.ts";

const here = import.meta.dirname;

const page = '<html lang="de"><body><h1>App</h1><script src="/app.js"></script></body></html>';
const supabaseSite = () => siteFromFiles({ "index.html": page, "app.js": 'const db = createClient("https://abcdefgh.supabase.co", key);' });
const table = "create table public.profiles (id uuid primary key);\n";
const secured = `${table}alter table public.profiles enable row level security;\n`;

test("fails when the site uses the Supabase project and a table has no row level security", async () => {
  const result = await runCrossCheck(here, await supabaseSite(), { "supabase/migrations/1.sql": table });
  assert.equal(result.status, "fail");
  assert.match(result.message, /uses abcdefgh\.supabase\.co/);
  assert.deepEqual(result.details, ['supabase/migrations/1.sql:1: Supabase table "profiles" has no row level security.']);
});

test("passes when every table of the used project has row level security", async () => {
  assert.equal((await runCrossCheck(here, await supabaseSite(), { "supabase/migrations/1.sql": secured })).status, "pass");
});

test("gives info when the site uses Supabase but the repository has no migrations", async () => {
  const result = await runCrossCheck(here, await supabaseSite(), { "src/app.ts": "x" });
  assert.equal(result.status, "info");
  assert.match(result.details[0], /^Supabase \(abcdefgh\.supabase\.co\): no migrations/);
});

test("finds Firebase from a request and fails for open rules", async () => {
  const site = await siteFromFiles({ "index.html": '<html><body>App<script src="https://abc-default-rtdb.firebaseio.com/x.js"></script></body></html>' });
  const result = await runCrossCheck(here, site, { "database.rules.json": '{ "rules": { ".read": true } }' });
  assert.equal(result.status, "fail");
});

test("ignores open Firebase rules when the site only uses Supabase", async () => {
  const result = await runCrossCheck(here, await supabaseSite(), { "supabase/migrations/1.sql": secured, "firestore.rules": "allow read, write: if true;" });
  assert.equal(result.status, "pass");
});

test("skips when the site uses neither service", async () => {
  const site = await siteFromFiles({ "index.html": page, "app.js": "console.log(1)" });
  assert.equal((await runCrossCheck(here, site, { "supabase/migrations/1.sql": table })).status, "skip");
});

test("warns when every table has row level security but a policy allows everything", async () => {
  const open = `${secured}create policy "all" on public.profiles for select using (true);\n`;
  const result = await runCrossCheck(here, await supabaseSite(), { "supabase/migrations/1.sql": open });
  assert.equal(result.status, "warn");
});
