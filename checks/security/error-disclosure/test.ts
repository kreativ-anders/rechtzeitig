import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes for a plain 404 page", async () => {
  assert.equal((await runCheck(here, "clean")).status, "pass");
});

test("fails when an error page shows a stack trace", async () => {
  const result = await runCheck(here, "stack-trace");
  assert.equal(result.status, "fail");
  assert.ok(result.details?.some((d) => d.includes("/var/www/html/index.php")));
});

test("warns for version headers", async () => {
  const result = await runCheck(here, "version-header");
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, ["x-powered-by: PHP/8.2.1"]);
});
