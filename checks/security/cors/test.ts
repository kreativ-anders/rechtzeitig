import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck, runFake } from "../../../test/helpers.ts";

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
