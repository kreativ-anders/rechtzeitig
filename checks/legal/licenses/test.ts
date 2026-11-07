import { test } from "node:test";
import assert from "node:assert/strict";
import { npmLock, runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

const lock = (license: string, dev = false) => npmLock({ lib: { version: "1.0.0", license, dev } });

// A MIT project with one dependency under `license`.
const mit = (license: string) => runRepoCheck(here, { "package.json": '{"license":"MIT"}', "package-lock.json": lock(license) });

test("passes for MIT dependencies in an MIT project", async () => {
  assert.equal((await mit("MIT")).status, "pass");
});

test("warns for a GPL dependency in an MIT project", async () => {
  const result = await mit("GPL-3.0");
  assert.equal(result.status, "warn");
  assert.match(result.details?.[0] ?? "", /^package-lock\.json: lib@1\.0\.0: GPL-3\.0\. If you ship it/);
});

test("warns for GPL-or-later, but not when another license can be chosen", async () => {
  assert.equal((await mit("GPL-3.0-or-later")).status, "warn");
  assert.equal((await mit("(MIT OR GPL-3.0-or-later)")).status, "pass");
  assert.equal((await mit("GPL-2.0-only OR GPL-3.0-only")).status, "warn");
});

test("treats Boost BSL-1.0 as permissive and BUSL as restricted", async () => {
  assert.equal((await mit("BSL-1.0")).status, "pass");
  const busl = await mit("BUSL-1.1");
  assert.equal(busl.status, "warn");
  assert.match(busl.details?.[0] ?? "", /Restricts use/);
});

test("accepts GPL dependencies only used for development", async () => {
  assert.equal((await runRepoCheck(here, { "package.json": '{"license":"MIT"}', "package-lock.json": lock("GPL-3.0", true) })).status, "pass");
});

test("warns for AGPL even in a GPL project", async () => {
  assert.equal((await runRepoCheck(here, { "package.json": '{"license":"GPL-3.0"}', "package-lock.json": lock("AGPL-3.0") })).status, "warn");
});

const cargo = `[[package]]\nname = "serde"\nversion = "1.0.0"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\n`;

test("skips instead of passing when no lockfile names a license", async () => {
  const result = await runRepoCheck(here, { "package.json": '{"license":"MIT"}', "Cargo.toml": "", "Cargo.lock": cargo });
  assert.equal(result.status, "skip");
  assert.match(result.message, /No lockfile names licenses \(cargo\)/);
  assert.equal((await runRepoCheck(here, { "package.json": '{"license":"MIT"}' })).status, "skip");
});

test("names the ecosystems it could not check next to a pass", async () => {
  const result = await runRepoCheck(here, { "package.json": '{"license":"MIT"}', "package-lock.json": lock("MIT"), "Cargo.lock": cargo });
  assert.equal(result.status, "pass");
  assert.deepEqual(result.details, ["1 production dependency not checked: lockfiles of cargo name no licenses."]);
});

test("flags GPL with Commons Clause", async () => {
  const result = await runRepoCheck(here, { LICENSE: "GNU GENERAL PUBLIC LICENSE\nVersion 3\n\nCommons Clause License Condition v1.0" });
  assert.equal(result.status, "warn");
  assert.match(result.details?.[0] ?? "", /Commons Clause may not hold/);
});
