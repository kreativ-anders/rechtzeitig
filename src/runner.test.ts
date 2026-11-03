import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadChecks, runChecks } from "./runner.ts";
import { fakeContext } from "../test/helpers.ts";
import { defineCheck, pass } from "./sdk.ts";

test("finds every check with an id from its folder", async () => {
  const ids = (await loadChecks()).map((c) => c.id);
  assert.ok(ids.includes("legal/imprint"));
  assert.ok(ids.every((id) => /^[a-z]+\/[a-z-]+$/.test(id)), ids.join(", "));
});

test("a broken check becomes an error and the others still run", async () => {
  const checks = [
    { id: "x/throws", check: defineCheck({ title: "throws", run: () => { throw new Error("boom"); } }) },
    { id: "x/empty", check: defineCheck({ title: "empty", run: () => undefined as never }) },
    { id: "x/ok", check: defineCheck({ title: "ok", run: () => pass("fine") }) },
  ];
  const outcomes = await runChecks(checks, fakeContext({}));
  assert.deepEqual(outcomes.map((o) => o.status), ["error", "error", "pass"]);
  assert.equal(outcomes[0].message, "boom");
});

test("asking for an unknown concept is an error, not a silent pass", async () => {
  const checks = [{ id: "x/typo", check: defineCheck({ title: "typo", run: (ctx) => pass(String(ctx.says("imprnt", "x"))) }) }];
  const [outcome] = await runChecks(checks, fakeContext({}));
  assert.equal(outcome.status, "error");
  assert.match(outcome.message, /Unknown concept "imprnt"/);
});

test("the README lists every check", async () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const missing = (await loadChecks()).map((c) => c.id).filter((id) => !readme.includes(`\`${id}\``));
  assert.deepEqual(missing, [], "add these checks to the table in README.md");
});
