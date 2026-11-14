import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck, runFake, runSite } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes when axe-core finds nothing", async () => {
  const result = await runCheck(here, "good");
  assert.equal(result.status, "pass", result.details?.join(" | "));
});

test("warns with page, element and axe-core rule", async () => {
  const result = await runCheck(here, "bad");
  assert.equal(result.status, "warn");
  assert.ok(Number(result.raw.message.params?.count) >= 2, result.message);
  assert.ok(result.details?.some((d) => d.includes("(image-alt)")), result.details?.join(" | "));
});

test("skips when axe-core did not run", async () => {
  assert.equal((await runFake(here)).status, "skip");
});

test("ignores violations of rules that belong to other checks", async () => {
  const axe = [{ rule: "not-this-check", count: 3, targets: ["#x"] }];
  assert.equal((await runFake(here, { axe })).status, "pass");
});

// #87: a page where axe-core gave no result is named with its reason, and the rest does not pass.
test("warns when axe-core gave no result on some pages", async () => {
  const result = await runSite(here, { "/": { axe: [] }, "/slow": { axeError: "timeout" }, "/broken": { axeError: "axe is not defined" } });
  assert.equal(result.status, "warn");
  assert.deepEqual(result.raw.details?.map((d) => [d.key, d.params?.page]), [["axe_timeout", "/slow"], ["axe_error", "/broken"]]);
  assert.ok(result.details?.some((d) => d.includes("axe is not defined")), result.details?.join(" | "));
  const none = await runSite(here, { "/": { axeError: "timeout" } });
  assert.equal(none.status, "skip");
  assert.deepEqual(none.raw.details?.map((d) => d.key), ["axe_timeout"]);
});
