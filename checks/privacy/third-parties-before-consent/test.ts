import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes when only the own server is used", async () => {
  assert.equal((await runCheck(here, "clean")).status, "pass");
});

test("fails for Google Fonts", async () => {
  const result = await runCheck(here, "google-fonts");
  assert.equal(result.status, "fail");
  assert.match(result.message, /Google Fonts/);
});

test("warns for a public CDN", async () => {
  const result = await runCheck(here, "cdn");
  assert.equal(result.status, "warn");
  assert.match(result.message, /jsDelivr/);
});

test("warns for unknown hosts, grouped by site", async () => {
  const result = await runCheck(here, "unknown");
  assert.equal(result.status, "warn");
  assert.match(result.message, /example-unknown\.com/);
  assert.match(result.details?.[0] ?? "", /^example-unknown\.com \(images\.example-unknown\.com\)/);
});
