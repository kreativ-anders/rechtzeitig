import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes with all headers", async () => {
  assert.equal((await runCheck(here, "complete")).status, "pass");
});

test("warns and lists missing headers", async () => {
  const result = await runCheck(here, "none");
  assert.equal(result.status, "warn");
  assert.equal(result.details?.length, 4);
});
