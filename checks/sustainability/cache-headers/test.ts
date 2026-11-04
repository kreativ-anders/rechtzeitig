import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck, runFake } from "../../../test/helpers.ts";

const here = import.meta.dirname;
const file = (cacheControl?: string, expires?: string) => ({
  url: "https://example.de/app.js", host: "example.de", type: "script", status: 200, cacheControl, expires,
});

test("passes when static files have a cache lifetime", async () => {
  assert.equal((await runCheck(here, "cached")).status, "pass");
});

test("warns for static files sent with no-cache", async () => {
  const result = await runCheck(here, "uncached");
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details.sort(), ["/app.js", "/style.css"]);
});

test("accepts a future Expires and rejects max-age=0", async () => {
  assert.equal((await runFake(here, { requests: [file(undefined, "Wed, 01 Jan 2099 00:00:00 GMT")] })).status, "pass");
  assert.equal((await runFake(here, { requests: [file("max-age=0", "Wed, 01 Jan 2099 00:00:00 GMT")] })).status, "warn");
  assert.equal((await runFake(here, { requests: [file()] })).status, "warn");
});

test("ignores other sites' files", async () => {
  const other = { ...file(), url: "https://cdn.other.com/a.js", host: "cdn.other.com" };
  assert.equal((await runFake(here, { requests: [other] })).status, "skip");
});
