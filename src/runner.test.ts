import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadChecks, runChecks, selectModules } from "./runner.ts";
import { validateRule, type Rule } from "./rules.ts";
import { checksHtml } from "./docs.ts";
import { fakeContext } from "../test/helpers.ts";
import { defineCheck, pass } from "./sdk.ts";

const rule = { id: "SEC-TEST-001", severity: "low", title: { de: "t", en: "t" }, how: "Reads something and compares it.", fix_hint: { de: "f", en: "f" }, meta: { last_reviewed: "2026-11-03", sources: [] } } as Rule;

test("every check has a folder id and a valid rule.yml with a unique id", async () => {
  const checks = await loadChecks();
  assert.ok(checks.every((c) => /^[a-z]+\/[a-z0-9-]+$/.test(c.id)), checks.map((c) => c.id).join(", "));
  const ids = checks.map((c) => c.rule.id);
  assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [], "duplicate rule ids");
});

test("the rule validator rejects broken rules", () => {
  assert.deepEqual(validateRule(rule, new Date("2026-11-03")), []);
  assert.match(validateRule({ ...rule, id: "imprint" }).join(), /does not match/);
  assert.match(validateRule({ ...rule, title: { de: "t" } as Rule["title"] }).join(), /title\.en is missing/);
  assert.match(validateRule(rule, new Date("2028-01-01")).join(), /older than 365 days/);
});

test("repository checks live in checks/repo/ and website checks elsewhere", async () => {
  const wrong = (await loadChecks()).filter((c) => c.id.startsWith("repo/") !== !!c.check.repo).map((c) => c.id);
  assert.deepEqual(wrong, []);
});

test("modules select checks by folder", async () => {
  const ids = selectModules(await loadChecks(), ["legal"]).map((c) => c.id);
  assert.ok(ids.length > 0 && ids.every((id) => id.startsWith("legal/")));
});

test("docs/checks.html is up to date (npm run docs)", async () => {
  const doc = readFileSync(new URL("../docs/checks.html", import.meta.url), "utf8");
  assert.ok(doc.includes(checksHtml(await loadChecks())), "run: npm run docs");
});

test("a broken check becomes an error and the others still run", async () => {
  const checks = [
    { id: "x/throws", rule, check: defineCheck({ run: () => { throw new Error("boom"); } }) },
    { id: "x/empty", rule, check: defineCheck({ run: () => undefined as never }) },
    { id: "x/ok", rule, check: defineCheck({ run: () => pass("fine") }) },
  ];
  const outcomes = await runChecks(checks, { web: fakeContext({}) });
  assert.deepEqual(outcomes.map((o) => o.status), ["error", "error", "pass"]);
  assert.equal(outcomes[0].message, "boom");
});

test("a check that throws a non-Error still gets a message", async () => {
  const checks = [{ id: "x/string", rule, check: defineCheck({ run: () => { throw "plain text\nsecond line"; } }) }];
  const [outcome] = await runChecks(checks, { web: fakeContext({}) });
  assert.equal(outcome.message, "plain text");
});

test("asking for an unknown concept is an error, not a silent pass", async () => {
  const checks = [{ id: "x/typo", rule, check: defineCheck({ run: (ctx) => pass(String(ctx.says("imprnt", "x"))) }) }];
  const [outcome] = await runChecks(checks, { web: fakeContext({}) });
  assert.equal(outcome.status, "error");
  assert.match(outcome.message, /Unknown concept "imprnt"/);
});
