import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeContext, fakePage, rendered, runCheck, runFake } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes without CORS headers", async () => {
  assert.equal((await runCheck(here, "none")).status, "pass");
});

test("fails for Access-Control-Allow-Origin * with credentials", async () => {
  const result = await runCheck(here, "credentials");
  assert.equal(result.status, "fail");
  assert.deepEqual(result.raw.details?.map((d) => `${d.key} ${d.params?.page}`), ["wildcard /"]);
});

test("fails for origin null with credentials", async () => {
  const headers = { "access-control-allow-origin": "null", "access-control-allow-credentials": "true" };
  const result = await runFake(here, { headers });
  assert.equal(result.status, "fail");
  assert.equal(result.raw.details?.[0].key, "null_origin");
});

test("passes for * without credentials and for a fixed origin with credentials", async () => {
  assert.equal((await runFake(here, { headers: { "access-control-allow-origin": "*" } })).status, "pass");
  const fixed = { "access-control-allow-origin": "https://app.example.de", "access-control-allow-credentials": "true" };
  assert.equal((await runFake(here, { headers: fixed })).status, "pass");
});

test("skips when no page of the site loaded", async () => {
  assert.equal((await runFake(here, { status: 0 })).status, "skip");
});

test("reads the headers of the load with JavaScript when the plain load failed", async () => {
  const page = fakePage("https://example.de/", { headers: { "access-control-allow-origin": "*", "access-control-allow-credentials": "true" } });
  const start = { ...page, noJs: { ...page.noJs, status: 0, headers: {} } };
  const { default: check } = await import("./check.ts");
  const result = rendered(here, await check.run(fakeContext(start.js, { start, pages: [start] })));
  assert.equal(result.status, "fail");
});
