import { test } from "node:test";
import assert from "node:assert/strict";
import { npmLock, runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

const run = (license: string, project = "MIT", dev = false) =>
  runRepoCheck(here, { "package.json": JSON.stringify({ license: project }), "package-lock.json": npmLock({ lib: { version: "2.0.0", license, dev }, base: { version: "1.0.0", license: "MIT" } }) });

test("passes without network copyleft", async () => {
  assert.equal((await run("MIT")).status, "pass");
  assert.equal((await run("GPL-3.0-only")).status, "pass", "GPL is legal/copyleft-dependencies");
  assert.equal((await run("MIT OR AGPL-3.0-or-later")).status, "pass", "a choice avoids it");
});

test("warns for AGPL, EUPL and OSL in production, also in a GPL project", async () => {
  const agpl = await run("AGPL-3.0-only", "GPL-3.0-only");
  assert.equal(agpl.status, "warn");
  assert.match(agpl.details[0], /^package-lock\.json: lib@2\.0\.0: AGPL-3\.0-only\. AGPL § 13/);
  assert.match((await run("EUPL-1.2")).details[0], /EUPL: online access/);
  assert.match((await run("OSL-3.0")).details[0], /OSL-3\.0 § 5/);
});

test("accepts dev dependencies and a project under AGPL itself", async () => {
  assert.equal((await run("AGPL-3.0-only", "MIT", true)).status, "pass");
  const own = await run("AGPL-3.0-only", "AGPL-3.0-or-later");
  assert.equal(own.status, "pass");
  assert.match(own.message, /under AGPL-3\.0-or-later itself/);
});

test("skips without license data", async () => {
  assert.equal((await runRepoCheck(here, { "yarn.lock": 'lib@^1:\n  version "1.0.0"\n' })).status, "skip");
});
