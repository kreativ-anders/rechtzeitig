import { test } from "node:test";
import assert from "node:assert/strict";
import { runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes with an ignored .env and a committed example", async () => {
  assert.equal((await runRepoCheck(here, { ".gitignore": "node_modules\n.env\n", ".env.example": "KEY=", "package.json": "{}" })).status, "pass");
});

test("fails for a committed .env", async () => {
  assert.equal((await runRepoCheck(here, { ".env.production": "KEY=value" })).status, "fail");
});

test("fails for an .env file with two suffixes, but not for a template of it", async () => {
  const bad = await runRepoCheck(here, { ".gitignore": ".env\n", "web/.env.production.local": "KEY=value" });
  const ok = await runRepoCheck(here, { ".gitignore": ".env\n", "web/.env.local.example": "KEY=", "web/.env.production.sample": "KEY=" });
  assert.equal(bad.status, "fail");
  assert.deepEqual(bad.details, ["web/.env.production.local"]);
  assert.equal(ok.status, "pass");
});

test("notes a missing .env rule for a Go module", async () => {
  assert.equal((await runRepoCheck(here, { ".gitignore": "bin\n", "go.mod": "module x\n" })).status, "info");
});

test("warns when .gitignore misses .env and the project has an .env template", async () => {
  assert.equal((await runRepoCheck(here, { ".gitignore": "node_modules\n", ".env.example": "KEY=" })).status, "warn");
});

test("only notes a missing .env rule when no .env is expected", async () => {
  assert.equal((await runRepoCheck(here, { ".gitignore": "node_modules\n", "package.json": "{}" })).status, "info");
});
