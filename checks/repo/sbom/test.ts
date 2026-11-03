import { test } from "node:test";
import assert from "node:assert/strict";
import { npmLock, runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

const lock = npmLock({ lodash: { version: "4.17.21", license: "MIT" } });

test("passes and counts components from the lockfile", async () => {
  const result = await runRepoCheck(here, { "package.json": "{}", "package-lock.json": lock });
  assert.equal(result.status, "pass");
  assert.deepEqual(result.details, ["npm: 1"]);
});

test("warns for a manifest without a lockfile", async () => {
  const result = await runRepoCheck(here, { "package.json": "{}", "api/composer.json": "{}", "api/composer.lock": '{"packages":[]}' });
  assert.equal(result.status, "warn");
  assert.equal(result.details?.[0], "package.json");
});

test("accepts a workspace member locked by a lockfile in a parent folder", async () => {
  const files = { "package.json": "{}", "package-lock.json": lock, "packages/ui/package.json": "{}", "apps/web/site/package.json": "{}" };
  assert.equal((await runRepoCheck(here, files)).status, "pass");
});

test("warns for a nested manifest when only a sibling folder has a lockfile", async () => {
  const result = await runRepoCheck(here, { "a/package.json": "{}", "a/package-lock.json": lock, "b/package.json": "{}" });
  assert.equal(result.status, "warn");
  assert.equal(result.details?.[0], "b/package.json");
});

test("skips repositories without packages", async () => {
  assert.equal((await runRepoCheck(here, { "README.md": "# hi" })).status, "skip");
});
