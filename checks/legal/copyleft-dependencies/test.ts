import { test } from "node:test";
import assert from "node:assert/strict";
import { npmLock, runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

/** A project under `project` with one dependency under `license`. */
const run = (license: string, project = "MIT", dev = false) =>
  runRepoCheck(here, { "package.json": JSON.stringify({ license: project }), "package-lock.json": npmLock({ lib: { version: "1.0.0", license, dev }, base: { version: "1.0.0", license: "MIT" } }) });

test("passes for permissive and weak copyleft dependencies in an MIT project", async () => {
  for (const license of ["MIT", "Apache-2.0", "LGPL-2.1-only", "MPL-2.0", "GPL-2.0-only WITH Classpath-exception-2.0"]) {
    assert.equal((await run(license)).status, "pass", license);
  }
  assert.match((await run("MIT")).message, /No copyleft conflict with MIT in 2 production dependencies/);
});

test("warns for GPL in an MIT project, with file and dependency", async () => {
  const result = await run("GPL-3.0-or-later");
  assert.equal(result.status, "warn");
  assert.match(result.details[0], /^package-lock\.json: lib@1\.0\.0: GPL-3\.0-or-later\. If you ship it .* not MIT\.$/);
});

test("a choice avoids GPL; AND does not", async () => {
  assert.equal((await run("(MIT OR GPL-3.0-or-later)")).status, "pass");
  assert.equal((await run("MIT AND GPL-3.0-only")).status, "warn");
  assert.equal((await run("GPL-2.0-only OR GPL-3.0-only")).status, "warn");
  // AGPL or GPL: the choice is GPL, which this rule reports (legal/network-copyleft does not).
  assert.equal((await run("AGPL-3.0-only OR GPL-3.0-only")).status, "warn");
});

test("leaves plain AGPL to legal/network-copyleft and dev dependencies alone", async () => {
  assert.equal((await run("AGPL-3.0-only")).status, "pass");
  assert.equal((await run("GPL-3.0-only", "MIT", true)).status, "pass");
});

test("GPL fits a GPL project, except GPL-2.0-only against GPLv3 and Apache-2.0", async () => {
  assert.equal((await run("GPL-3.0-only", "GPL-3.0-or-later")).status, "pass");
  assert.equal((await run("GPL-2.0-or-later", "GPL-2.0-only")).status, "pass");
  assert.match((await run("GPL-3.0-only", "GPL-2.0-only")).details[0], /cannot be combined with GPL-2\.0-only/);
  assert.equal((await run("Apache-2.0", "GPL-2.0-only")).status, "warn");
  assert.equal((await run("GPL-2.0-only", "GPL-3.0-only")).status, "warn");
  assert.equal((await run("Apache-2.0", "GPL-3.0-only")).status, "pass");
});

test("names a project without license and dependencies it could not check", async () => {
  const none = await runRepoCheck(here, { "package-lock.json": npmLock({ lib: { version: "1.0.0", license: "GPL-3.0-only" } }) });
  assert.match(none.details[0], /the project license \(no license\) is not clear/);
  const cargo = `[[package]]\nname = "serde"\nversion = "1.0.0"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\n`;
  const mixed = await runRepoCheck(here, { "package.json": '{"license":"MIT"}', "package-lock.json": npmLock({ lib: { version: "1.0.0", license: "MIT" } }), "Cargo.lock": cargo });
  assert.equal(mixed.status, "pass");
  assert.deepEqual(mixed.details, ["1 production dependency not checked: Cargo.lock name no licenses. See legal/unknown-licenses."]);
});

test("skips instead of passing when no lockfile names a license", async () => {
  const cargo = `[[package]]\nname = "serde"\nversion = "1.0.0"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\n`;
  const result = await runRepoCheck(here, { "package.json": '{"license":"MIT"}', "Cargo.lock": cargo });
  assert.equal(result.status, "skip");
  assert.match(result.message, /No lockfile names licenses \(Cargo\.lock\)/);
  assert.equal((await runRepoCheck(here, { "package.json": '{"license":"MIT"}' })).status, "skip");
});
