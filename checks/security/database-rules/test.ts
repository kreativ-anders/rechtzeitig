import { test } from "node:test";
import assert from "node:assert/strict";
import { cpuMs, runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

const migration = (extra = "") => `create table public.profiles (id uuid primary key);\n${extra}`;

test("passes when every table has row level security", async () => {
  const files = { "supabase/migrations/1_init.sql": migration("alter table public.profiles enable row level security;") };
  assert.equal((await runRepoCheck(here, files)).status, "pass");
});

test("fails for a table without row level security", async () => {
  const result = await runRepoCheck(here, { "supabase/migrations/1_init.sql": migration() });
  assert.equal(result.status, "fail");
  assert.deepEqual(result.details, ['supabase/migrations/1_init.sql:1: Supabase table "profiles" has no row level security.']);
});

test("points to the line of the create table statement", async () => {
  const sql = "-- init\ncreate table public.a (id int);\nalter table a enable row level security;\n\n  create table public.b (\n  id int\n);";
  const result = await runRepoCheck(here, { "supabase/migrations/1.sql": sql });
  assert.deepEqual(result.raw.details, [{ file: "supabase/migrations/1.sql", line: 5, key: "no_rls", params: { table: "b" } }]);
});

test("ignores tables outside the public schema and reads alter table if exists", async () => {
  const sql = [
    "create table private.secrets (id int);",
    'create table if not exists "Orders" (id int);',
    'alter table if exists only public."Orders" enable row level security;',
  ].join("\n");
  assert.equal((await runRepoCheck(here, { "supabase/migrations/1.sql": sql })).status, "pass");
});

test("names a public table without row level security when another schema has one of the same name", async () => {
  const sql = "create table public.notes (id int);\ncreate table private.notes (id int);\nalter table private.notes enable row level security;";
  const result = await runRepoCheck(here, { "supabase/migrations/1.sql": sql });
  assert.equal(result.status, "fail");
  assert.deepEqual(result.details, ['supabase/migrations/1.sql:1: Supabase table "notes" has no row level security.']);
});

test("warns for an open policy, but not when using (true) belongs to the next statement", async () => {
  const secured = migration("alter table public.profiles enable row level security;\n");
  const open = await runRepoCheck(here, { "supabase/migrations/1.sql": secured + "create policy p on profiles for select using (true);" });
  const split = await runRepoCheck(here, {
    "supabase/migrations/1.sql": secured + "create policy p on profiles for select using (auth.uid() = id);\nselect 1 where exists (select 1) using (true);",
  });
  assert.equal(open.status, "warn");
  assert.equal(split.status, "pass");
});

test("fails for Firestore rules in test mode", async () => {
  const rules = "service cloud.firestore { match /{document=**} { allow read, write: if request.time < timestamp.date(2026, 12, 1); } }";
  const result = await runRepoCheck(here, { "firestore.rules": rules });
  assert.equal(result.status, "fail");
  assert.match(result.details?.[0] ?? "", /test mode/);
});

test("stays fast on a long SQL statement without a match", async () => {
  const files = { "supabase/migrations/1.sql": `alter table ${"a".repeat(200_000)}\n${" ".repeat(200_000)}create policy ${"(".repeat(100_000)}` };
  assert.ok((await cpuMs(() => runRepoCheck(here, files))) < 500);
});

test("fails for open Firestore rules", async () => {
  const rules = "service cloud.firestore { match /{document=**} { allow read, write: if true; } }";
  assert.equal((await runRepoCheck(here, { "firestore.rules": rules })).status, "fail");
});

test("stays fast on a long rules file without a match", async () => {
  // About 100 ms CPU on a laptop, 1 MB of input; backtracking would take seconds.
  assert.ok((await cpuMs(() => runRepoCheck(here, { "firestore.rules": "allow read ".repeat(90_000) }))) < 1000);
});
