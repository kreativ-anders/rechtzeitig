import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes when optional categories start unticked", async () => {
  assert.equal((await runCheck(here, "unticked")).status, "pass");
});

test("fails when statistics is ticked by default", async () => {
  const result = await runCheck(here, "ticked");
  assert.equal(result.status, "fail");
  assert.deepEqual(result.details, ["Statistik"]);
});
