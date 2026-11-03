import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeContext } from "../../../test/helpers.ts";
import check from "./check.ts";

const run = (...args: Parameters<typeof fakeContext>) => check.run(fakeContext(...args));

test("passes when HTTP redirects to HTTPS", async () => {
  const result = await run({}, { http: { status: 301, location: "https://example.de/" } });
  assert.equal(result.status, "pass");
});

test("passes when HTTP is not offered at all", async () => {
  assert.equal((await run({}, { http: { error: "connection refused" } })).status, "pass");
});

test("fails when HTTP serves the page unencrypted", async () => {
  assert.equal((await run({}, { http: { status: 200, location: "" } })).status, "fail");
});

test("fails for an http:// site", async () => {
  assert.equal((await run({ finalUrl: "http://example.de/" })).status, "fail");
});
