import { test } from "node:test";
import assert from "node:assert/strict";
import { runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

const migration = (extra = "") => `create table public.profiles (id uuid primary key);\n${extra}`;

test("passes when every table has row level security", async () => {
  const files = { "supabase/migrations/1_init.sql": migration("alter table public.profiles enable row level security;") };
  assert.equal((await runRepoCheck(here, files)).status, "pass");
});

test("fails for a table without row level security", async () => {
  const result = await runRepoCheck(here, { "supabase/migrations/1_init.sql": migration() });
  assert.equal(result.status, "fail");
  assert.deepEqual(result.details, ['Supabase table "profiles" has no row level security.']);
});

test("fails for open Firestore rules", async () => {
  const rules = "service cloud.firestore { match /{document=**} { allow read, write: if true; } }";
  assert.equal((await runRepoCheck(here, { "firestore.rules": rules })).status, "fail");
});
