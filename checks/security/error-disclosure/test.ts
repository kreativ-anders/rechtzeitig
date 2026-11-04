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

test("ignores links, scripts and prose that only look like errors", async () => {
  assert.equal((await runCheck(here, "prose")).status, "pass");
});

test("warns for version headers", async () => {
  const result = await runCheck(here, "version-header");
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, ["x-powered-by: PHP/8.2.1"]);
});

test("leaves no tag in the finding text, even from nested tags", async () => {
  const result = await runCheck(here, "nested-tags");
  assert.equal(result.status, "fail");
  assert.ok(result.details?.length);
  assert.ok(result.details.every((d) => !/[<>]/.test(d)));
});

test("flags a server header only with a version number", async () => {
  assert.equal((await runCheck(here, "server-name")).status, "pass");
  const result = await runCheck(here, "server-version");
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, ["server: nginx/1.25.3"]);
});
