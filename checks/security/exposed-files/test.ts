import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes when nothing is public", async () => {
  assert.equal((await runCheck(here, "clean")).status, "pass");
});

test("fails for a public .env and .git folder", async () => {
  const result = await runCheck(here, "leaky");
  assert.equal(result.status, "fail");
  assert.deepEqual(result.details, ["/.env", "/.git/config"]);
});

test("ignores servers that answer every path with HTML", async () => {
  assert.equal((await runCheck(here, "html-fallback")).status, "pass");
});
