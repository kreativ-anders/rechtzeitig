import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadChecks, runChecks } from "./runner.ts";
import { fakeContext } from "../test/helpers.ts";
import { defineCheck, pass } from "./sdk.ts";

test("finds every check with an id from its folder", async () => {
  const ids = (await loadChecks()).map((c) => c.id);
  assert.ok(ids.includes("legal/imprint"));
  assert.ok(ids.every((id) => /^[a-z]+\/[a-z0-9-]+$/.test(id)), ids.join(", "));
});

test("a broken check becomes an error and the others still run", async () => {
  const checks = [
    { id: "x/throws", check: defineCheck({ title: "throws", run: () => { throw new Error("boom"); } }) },
    { id: "x/empty", check: defineCheck({ title: "empty", run: () => undefined as never }) },
    { id: "x/ok", check: defineCheck({ title: "ok", run: () => pass("fine") }) },
  ];
  const outcomes = await runChecks(checks, { web: fakeContext({}) });
  assert.deepEqual(outcomes.map((o) => o.status), ["error", "error", "pass"]);
  assert.equal(outcomes[0].message, "boom");
});

test("asking for an unknown concept is an error, not a silent pass", async () => {
  const checks = [{ id: "x/typo", check: defineCheck({ title: "typo", run: (ctx) => pass(String(ctx.says("imprnt", "x"))) }) }];
  const [outcome] = await runChecks(checks, { web: fakeContext({}) });
  assert.equal(outcome.status, "error");
  assert.match(outcome.message, /Unknown concept "imprnt"/);
});

test("docs/checks.md lists every check", async () => {
  const doc = readFileSync(new URL("../docs/checks.md", import.meta.url), "utf8");
  const missing = (await loadChecks()).map((c) => c.id).filter((id) => !doc.includes(`\`${id}\``));
  assert.deepEqual(missing, [], "add these checks to docs/checks.md");
});

test("repository checks live in checks/repo/ and website checks elsewhere", async () => {
  const wrong = (await loadChecks()).filter((c) => c.id.startsWith("repo/") !== !!c.check.repo).map((c) => c.id);
  assert.deepEqual(wrong, []);
});
