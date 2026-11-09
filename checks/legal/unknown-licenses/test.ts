import { test } from "node:test";
import assert from "node:assert/strict";
import { npmLock, runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

const lock = (pkgs: Record<string, string | undefined>) =>
  npmLock(Object.fromEntries(Object.entries(pkgs).map(([name, license]) => [name, { version: "1.0.0", license }])));
const cargo = `[[package]]\nname = "serde"\nversion = "1.0.0"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\n`;

test("passes when every production license is a known SPDX expression", async () => {
  const result = await runRepoCheck(here, { "package-lock.json": lock({ a: "MIT", b: "(MIT OR Apache-2.0)", c: "GPL-3.0" }) });
  assert.equal(result.status, "pass");
});

test("warns for missing, UNLICENSED, SEE LICENSE IN and custom licenses", async () => {
  const result = await runRepoCheck(here, {
    "package-lock.json": lock({ a: "MIT", none: undefined, closed: "UNLICENSED", file: "SEE LICENSE IN EULA.md", own: "LicenseRef-Acme", odd: "MIT, ISC" }),
  });
  assert.equal(result.status, "warn");
  assert.match(result.message, /5 production dependencies without a clear license/);
  assert.ok(result.details.some((d) => /closed@1\.0\.0: UNLICENSED, no rights of use/.test(d)));
  assert.ok(result.details.some((d) => /none@1\.0\.0: no license in the lockfile/.test(d)));
});

test("names a license without an SPDX id as info", async () => {
  const result = await runRepoCheck(here, { "package-lock.json": lock({ a: "BSD" }) });
  assert.equal(result.status, "info");
  assert.match(result.details[0], /BSD is not an SPDX id/);
});

test("never passes with gaps: other ecosystems, unreadable lockfiles, files without a parser", async () => {
  const gaps = await runRepoCheck(here, { "package-lock.json": lock({ a: "MIT" }), "Cargo.lock": cargo, "composer.lock": "{", "Gemfile.lock": "GEM\n" });
  assert.equal(gaps.status, "info");
  assert.deepEqual(gaps.details, [
    "Cargo.lock: 1 cargo production dependency: this lockfile names no licenses, not checked.",
    "composer.lock: lockfile not read, its licenses were not checked.",
    "Gemfile.lock: Bundler (Ruby): no parser yet, licenses not checked.",
  ]);
  const only = await runRepoCheck(here, { "Cargo.lock": cargo });
  assert.equal(only.status, "skip");
  assert.match(only.message, /license of 1 production dependency is not known/);
});

test("skips without dependencies", async () => {
  assert.equal((await runRepoCheck(here, { "README.md": "hi" })).status, "skip");
});

// Ported from the former legal/licenses test: composer.lock carries licenses, so it is checked, not a gap.
test("checks composer.lock, which names licenses", async () => {
  const composer = JSON.stringify({ packages: [{ name: "a/b", version: "1.0.0", license: ["MIT"] }] });
  const result = await runRepoCheck(here, { "composer.lock": composer });
  assert.equal(result.status, "pass");
  assert.deepEqual(result.details, []);
});
