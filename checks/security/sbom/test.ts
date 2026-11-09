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

test("warns when a lockfile is only a Git LFS pointer, even next to a good one", async () => {
  const pointer = "version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 5000000\n";
  const result = await runRepoCheck(here, { "package.json": "{}", "package-lock.json": lock, "web/package.json": "{}", "web/package-lock.json": pointer });
  assert.equal(result.status, "warn");
  assert.match(result.details?.[0] ?? "", /^web\/package-lock\.json: not read: Git LFS pointer/);
});

test("does not pass when package files have no parser", async () => {
  const result = await runRepoCheck(here, { "package.json": "{}", "package-lock.json": lock, "java/pom.xml": "<project/>" });
  assert.equal(result.status, "info");
  assert.match(result.message, /SBOM incomplete: .*\(Maven\)/);
  assert.equal(result.details?.[0], "java/pom.xml: Maven: no parser, not in the SBOM");
});

test("does not pass when the lockfiles hold no component", async () => {
  const result = await runRepoCheck(here, { "composer.json": "{}", "composer.lock": '{"packages":[]}' });
  assert.equal(result.status, "info");
  assert.match(result.message, /SBOM is empty/);
});

test("skips repositories without packages", async () => {
  assert.equal((await runRepoCheck(here, { "README.md": "# hi" })).status, "skip");
});

test("accepts a lockfile in the direct parent folder of a nested manifest", async () => {
  const result = await runRepoCheck(here, { "apps/web/package.json": "{}", "apps/package-lock.json": lock });
  assert.equal(result.status, "pass");
});
