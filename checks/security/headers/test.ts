import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck, runFake } from "../../../test/helpers.ts";

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

test("takes HSTS as given under a preloaded top-level domain such as .dev", async () => {
  const result = await runFake(here, { finalUrl: "https://example.dev/", headers: {}, meta: {} });
  assert.equal(result.status, "warn");
  assert.ok(!result.details.includes("Strict-Transport-Security"));
  assert.match(result.details.at(-1) ?? "", /\.dev is on the browsers' HSTS preload list/);
});

test("still asks for HSTS under other top-level domains", async () => {
  const result = await runFake(here, { finalUrl: "https://example.de/", headers: {}, meta: {} });
  assert.ok(result.details.includes("Strict-Transport-Security"));
});
