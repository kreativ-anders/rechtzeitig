import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck, runFake } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes when axe-core finds nothing, one live region is fine", async () => {
  const result = await runCheck(here, "good");
  assert.equal(result.status, "pass", result.details?.join(" | "));
});

test("warns with page, element and rule, own rules included", async () => {
  const result = await runCheck(here, "bad");
  assert.equal(result.status, "warn");
  const rules = ["landmark-no-duplicate-banner", "landmark-no-duplicate-main", "aria-dialog-name", "rechtzeitig-aria-hidden-false", "rechtzeitig-live-region"];
  for (const rule of rules) assert.ok(result.details?.some((d) => d.includes(`(${rule})`)), `${rule}: ${result.details?.join(" | ")}`);
});

test("live regions count only above the threshold", async () => {
  const one = [{ rule: "rechtzeitig-live-region", count: 1, targets: ["#a"] }];
  assert.equal((await runFake(here, { axe: one })).status, "pass");
  const two = [{ rule: "rechtzeitig-live-region", count: 2, targets: ["#a", "#b"] }];
  assert.equal((await runFake(here, { axe: two })).status, "warn");
});

test("skips when axe-core did not run", async () => {
  assert.equal((await runFake(here)).status, "skip");
});

test("ignores violations of rules that belong to other checks", async () => {
  const axe = [{ rule: "not-this-check", count: 3, targets: ["#x"] }];
  assert.equal((await runFake(here, { axe })).status, "pass");
});
