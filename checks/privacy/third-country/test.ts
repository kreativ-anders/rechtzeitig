import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes when the policy mentions the USA", async () => {
  assert.equal((await runCheck(here, "named")).status, "pass");
});

test("warns when a US service is used but not explained", async () => {
  const result = await runCheck(here, "unnamed");
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, ["Google Fonts (US)"]);
});
