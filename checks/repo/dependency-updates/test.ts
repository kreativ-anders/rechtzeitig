import { test } from "node:test";
import assert from "node:assert/strict";
import { runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;
const npm = { "package-lock.json": JSON.stringify({ packages: { "node_modules/a": { version: "1.0.0" } } }) };
const composer = { "composer.lock": JSON.stringify({ packages: [{ name: "x/y", version: "1.0.0" }] }) };
const dependabot = (...ecosystems: string[]) => ({
  ".github/dependabot.yml": `version: 2\nupdates:\n${ecosystems.map((e) => `  - package-ecosystem: ${e}\n    directory: /\n`).join("")}`,
});

test("passes when Dependabot covers every ecosystem", async () => {
  assert.equal((await runRepoCheck(here, { ...npm, ...dependabot("npm") })).status, "pass");
});

test("warns when Dependabot misses an ecosystem", async () => {
  const result = await runRepoCheck(here, { ...npm, ...composer, ...dependabot("npm") });
  assert.equal(result.status, "warn");
  assert.match(result.message, /composer/);
});

test("passes with Renovate", async () => {
  assert.equal((await runRepoCheck(here, { ...npm, "renovate.json": "{}" })).status, "pass");
});

test("notes a scanner without update pull requests", async () => {
  const workflow = { ".github/workflows/ci.yml": "steps:\n  - run: npm audit --omit=dev\n" };
  assert.equal((await runRepoCheck(here, { ...npm, ...workflow })).status, "info");
});

test("warns when nothing watches the dependencies", async () => {
  assert.equal((await runRepoCheck(here, npm)).status, "warn");
});
