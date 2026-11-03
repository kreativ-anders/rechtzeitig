import { test } from "node:test";
import assert from "node:assert/strict";
import { npmLock, runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

const lock = (license: string, dev = false) => npmLock({ lib: { version: "1.0.0", license, dev } });

test("passes for MIT dependencies in an MIT project", async () => {
  assert.equal((await runRepoCheck(here, { "package.json": '{"license":"MIT"}', "package-lock.json": lock("MIT") })).status, "pass");
});

test("warns for a GPL dependency in an MIT project", async () => {
  const result = await runRepoCheck(here, { "package.json": '{"license":"MIT"}', "package-lock.json": lock("GPL-3.0") });
  assert.equal(result.status, "warn");
  assert.match(result.details?.[0] ?? "", /^lib@1\.0\.0: GPL-3\.0\. If you ship it/);
});

test("accepts GPL dependencies only used for development", async () => {
  assert.equal((await runRepoCheck(here, { "package.json": '{"license":"MIT"}', "package-lock.json": lock("GPL-3.0", true) })).status, "pass");
});

test("warns for AGPL even in a GPL project", async () => {
  assert.equal((await runRepoCheck(here, { "package.json": '{"license":"GPL-3.0"}', "package-lock.json": lock("AGPL-3.0") })).status, "warn");
});

test("flags GPL with Commons Clause", async () => {
  const result = await runRepoCheck(here, { LICENSE: "GNU GENERAL PUBLIC LICENSE\nVersion 3\n\nCommons Clause License Condition v1.0" });
  assert.equal(result.status, "warn");
  assert.match(result.details?.[0] ?? "", /Commons Clause may not hold/);
});
