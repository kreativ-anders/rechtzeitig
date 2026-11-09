import { test } from "node:test";
import assert from "node:assert/strict";
import { loadYaml } from "../../../src/sdk.ts";
import { runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;
const TEXTS = loadYaml<Record<string, string>>("data/license-texts.yml");
const MIT = TEXTS.MIT.replace("<year> <copyright holders>", "2026 Jane Doe");
const pkg = (license: unknown) => JSON.stringify({ name: "x", license });

test("passes for a manifest and an unchanged license text that agree", async () => {
  const result = await runRepoCheck(here, { "package.json": pkg("MIT"), LICENSE: MIT });
  assert.equal(result.status, "pass");
  assert.equal(result.message, "Project license: package.json: MIT.");
  assert.equal((await runRepoCheck(here, { "Cargo.toml": '[package]\nname = "x"\nlicense = "MIT OR Apache-2.0"\n', "LICENSE-MIT": MIT, "LICENSE-APACHE": TEXTS["Apache-2.0"] })).status, "pass");
  assert.equal((await runRepoCheck(here, { "package.json": pkg("UNLICENSED") })).status, "pass", "proprietary on purpose");
  assert.equal((await runRepoCheck(here, { "package.json": pkg("LGPL-3.0-or-later"), COPYING: "GNU GENERAL PUBLIC LICENSE\nVersion 3", "COPYING.LESSER": "GNU LESSER GENERAL PUBLIC LICENSE\nVersion 3" })).status, "pass");
});

test("says so when the project has no license", async () => {
  const result = await runRepoCheck(here, { "package.json": "{}", "index.js": "" });
  assert.equal(result.status, "info");
  assert.match(result.message, /no license: all rights reserved/);
});

test("warns when manifest and license file disagree", async () => {
  const result = await runRepoCheck(here, { "package.json": pkg("MIT"), LICENSE: TEXTS["Apache-2.0"] });
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, ["LICENSE: The license text is Apache-2.0, the manifests say MIT."]);
  const two = await runRepoCheck(here, { "package.json": pkg("MIT"), "composer.json": pkg("GPL-3.0-only") });
  assert.match(two.details[0], /^composer\.json: The manifests name different licenses/);
});

test("warns for ids that are not SPDX, notes deprecated ones", async () => {
  assert.match((await runRepoCheck(here, { "package.json": pkg("Apache 2.0") })).details[0], /Apache 2\.0 is not an SPDX expression/);
  assert.match((await runRepoCheck(here, { "package.json": pkg("BSD") })).details[0], /BSD is not an SPDX license id/);
  const old = await runRepoCheck(here, { "package.json": pkg("GPL-3.0"), LICENSE: "GNU GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007" });
  assert.equal(old.status, "info");
  assert.match(old.details[0], /GPL-3\.0 is a deprecated SPDX id/);
});

test("notes a license text with an added or removed condition", async () => {
  const evil = MIT.replace("portions of the Software.", "portions of the Software.\n\nThe Software shall be used for Good, not Evil.");
  const added = await runRepoCheck(here, { "package.json": pkg("MIT"), LICENSE: evil });
  assert.equal(added.status, "info");
  assert.match(added.details[0], /^LICENSE: MIT text with \d+ word pairs that the SPDX text does not have/);
  const removed = await runRepoCheck(here, { LICENSE: MIT.replace(/The above copyright notice[^.]*\./, "") });
  assert.match(removed.details[0], /MIT text lacks \d+ word pairs/);
});

test("warns for GPL with Commons Clause", async () => {
  const result = await runRepoCheck(here, { LICENSE: "GNU GENERAL PUBLIC LICENSE\nVersion 3\n\nCommons Clause License Condition v1.0" });
  assert.equal(result.status, "warn");
  assert.match(result.details[0], /Commons Clause may not hold/);
});

test("notes a license text it does not recognize", async () => {
  const result = await runRepoCheck(here, { LICENSE: "You may use this for anything nice." });
  assert.equal(result.status, "info");
  assert.match(result.details[0], /License text not recognized/);
});
