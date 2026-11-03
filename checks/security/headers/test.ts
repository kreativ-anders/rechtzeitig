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

test("counts CSP and Referrer-Policy from <meta>, but not frame-ancestors or nosniff", async () => {
  const result = await runCheck(here, "meta");
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, [
    "X-Content-Type-Options: nosniff",
    "X-Frame-Options or CSP frame-ancestors (browsers ignore frame-ancestors in <meta>)",
    "Set as <meta>: content-security-policy, referrer-policy",
  ]);
});
