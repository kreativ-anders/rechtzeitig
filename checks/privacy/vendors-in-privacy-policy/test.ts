import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes when the policy names Google Fonts", async () => {
  assert.equal((await runCheck(here, "named")).status, "pass");
});

test("warns when the policy does not name it", async () => {
  const result = await runCheck(here, "unnamed");
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, ["Google Fonts"]);
});

test("skips without a privacy policy", async () => {
  assert.equal((await runCheck(here, "none")).status, "skip");
});
