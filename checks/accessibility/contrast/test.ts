import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck, runFake } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes when axe-core finds nothing", async () => {
  const result = await runCheck(here, "good");
  assert.equal(result.status, "pass", result.details?.join(" | "));
});

test("warns with page, element and axe-core rule", async () => {
  const result = await runCheck(here, "bad");
  assert.equal(result.status, "warn");
  assert.ok(Number(result.raw.message.params?.count) >= 1, result.message);
  assert.ok(result.details?.some((d) => d.includes("(color-contrast)")), result.details?.join(" | "));
});

test("skips when axe-core did not run", async () => {
  assert.equal((await runFake(here)).status, "skip");
});

test("ignores violations of rules that belong to other checks", async () => {
  const axe = [{ rule: "not-this-check", count: 3, targets: ["#x"] }];
  assert.equal((await runFake(here, { axe })).status, "pass");
});
