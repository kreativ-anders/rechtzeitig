import { test } from "node:test";
import assert from "node:assert/strict";
import { fakePage, runCheck, runFake } from "../../../test/helpers.ts";
import { emptySnapshot } from "../../../src/capture.ts";
import type { Page, Snapshot } from "../../../src/sdk.ts";

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

// Audit 2026-11-10: a failed load with JavaScript must not hide what the load without JavaScript saw.
const failedJs = (url: string, noJs: Partial<Snapshot>): Page => ({ ...fakePage(url, noJs), js: { ...emptySnapshot(url), error: "Timeout" } });

test("a request seen without JavaScript counts when the load with JavaScript failed", async () => {
  const start = failedJs("https://example.de/", { requests: [{ url: "https://www.google-analytics.com/g/collect", host: "www.google-analytics.com", type: "image" }] });
  const result = await runFake(here, start.noJs, { start, pages: [start] });
  assert.equal(result.status, "fail");
});

test("no pass when the load with JavaScript failed", async () => {
  const start = failedJs("https://example.de/", {});
  const result = await runFake(here, start.noJs, { start, pages: [start] });
  assert.equal(result.status, "warn");
});
