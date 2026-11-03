import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes without cookies", async () => {
  assert.equal((await runCheck(here, "clean")).status, "pass");
});

test("fails for a Google Analytics cookie", async () => {
  const result = await runCheck(here, "tracking");
  assert.equal(result.status, "fail");
  assert.match(result.details?.[0] ?? "", /^_ga .*Google Analytics/);
});

test("lists own cookies and storage for review", async () => {
  const result = await runCheck(here, "own");
  assert.equal(result.status, "info");
  assert.deepEqual(result.details?.map((d) => d.split(" ")[0]), ["session", "localStorage:"]);
});
