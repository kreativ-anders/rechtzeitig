import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck, runFake } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes with Permissions-Policy and COOP headers", async () => {
  assert.equal((await runCheck(here, "complete")).status, "pass");
});

test("warns and names both headers when they are missing", async () => {
  const result = await runCheck(here, "none");
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, ["Permissions-Policy", "Cross-Origin-Opener-Policy"]);
});

test("does not count either policy from <meta>", async () => {
  const result = await runCheck(here, "meta");
  assert.equal(result.status, "warn");
  assert.equal(result.raw.details?.filter((d) => d.key === "meta_ignored").length, 2);
});

test("counts COOP unsafe-none and report-only as missing", async () => {
  const headers = {
    "permissions-policy": "camera=()",
    "cross-origin-opener-policy": "unsafe-none",
    "cross-origin-opener-policy-report-only": "same-origin",
  };
  const result = await runFake(here, { headers });
  assert.equal(result.status, "warn");
  assert.match(result.message, /^1 /);
  assert.deepEqual(result.raw.details?.map((d) => d.key), ["coop_unsafe", "coop_report_only"]);
});

test("accepts COOP with a report-to parameter", async () => {
  const headers = { "permissions-policy": "camera=()", "cross-origin-opener-policy": 'same-origin; report-to="coop"' };
  assert.equal((await runFake(here, { headers })).status, "pass");
});

test("a report-only COOP is named, but not counted as a second missing header", async () => {
  const headers = { "permissions-policy": "camera=()", "cross-origin-opener-policy-report-only": "same-origin" };
  const result = await runFake(here, { headers });
  assert.equal(result.status, "warn");
  assert.equal(result.raw.message.params?.count, 1);
});

test("counts both missing headers next to a report-only COOP", async () => {
  const result = await runFake(here, { headers: { "cross-origin-opener-policy-report-only": "same-origin" } });
  assert.equal(result.raw.message.params?.count, 2);
});
