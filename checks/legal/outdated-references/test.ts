import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes when imprint and privacy policy name current laws", async () => {
  assert.equal((await runCheck(here, "current")).status, "pass");
});

test("warns for TMG, RStV, TTDSG and Privacy Shield", async () => {
  const result = await runCheck(here, "old");
  assert.equal(result.status, "warn");
  assert.deepEqual(result.raw.details?.map((d) => d.params?.old), ["TMG", "RStV", "TTDSG", "Privacy Shield"]);
});

test("skips without legal pages", async () => {
  assert.equal((await runCheck(here, "none")).status, "skip");
});
