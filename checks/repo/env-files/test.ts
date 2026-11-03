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

test("warns when .gitignore misses .env and the project has an .env template", async () => {
  assert.equal((await runRepoCheck(here, { ".gitignore": "node_modules\n", ".env.example": "KEY=" })).status, "warn");
});

test("only notes a missing .env rule when no .env is expected", async () => {
  assert.equal((await runRepoCheck(here, { ".gitignore": "node_modules\n", "package.json": "{}" })).status, "info");
});
