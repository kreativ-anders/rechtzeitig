import { test } from "node:test";
import assert from "node:assert/strict";
import { emptySnapshot } from "../../../src/capture.ts";
import { failedJsPage, fakePage, runCheck, runFake } from "../../../test/helpers.ts";
import type { Timer } from "../../../src/sdk.ts";

const here = import.meta.dirname;
const at = Date.parse("2026-11-22T10:00:00Z");
const timer = (text: string, later: string, offset = 0): Timer => ({ text, later, at: at + offset });

test("warns for a countdown that starts again for a new visitor", async () => {
  const result = await runCheck(here, "restart");
  assert.equal(result.status, "warn", result.message);
  assert.equal(result.raw.details?.[0].key, "restarts");
  assert.match(result.details[0], /00:14:5\d/);
});

test("passes for a countdown to the same end for every visitor", async () => {
  const result = await runCheck(here, "fixed");
  assert.equal(result.status, "pass", `${result.message} ${result.details.join(" ")}`);
});

test("compares end times: the same end within the tolerance passes, a later one warns", async () => {
  const first = { timers: [timer("Noch 02 Std. 10 Min. 05 Sek.", "Noch 02 Std. 10 Min. 04 Sek.")] };
  const same = fakePage("https://example.de/", first);
  same.fresh = { ...emptySnapshot("https://example.de/"), status: 200, timers: [timer("02:09:55", "02:09:54", 10_000)] };
  assert.equal((await runFake(here, first, { pages: [same] })).status, "pass");
  const later = fakePage("https://example.de/", first);
  later.fresh = { ...emptySnapshot("https://example.de/"), status: 200, timers: [timer("02:10:05", "02:10:04", 10_000)] };
  const result = await runFake(here, first, { pages: [later] });
  assert.equal(result.status, "warn");
  assert.match(result.details[0], /10 s later/);
});

test("a text that does not count down is no countdown: prices, clocks, static numbers", async () => {
  const page = fakePage("https://example.de/", { timers: [timer("12 Monate 24 Monate 36 Monate", "12 Monate 24 Monate 36 Monate"), timer("14:03:22", "14:03:23")] });
  assert.equal((await runFake(here, {}, { pages: [page] })).status, "pass");
});

// No pass on missing evidence.
test("gives info when the third load failed or showed no running countdown", async () => {
  const first = { timers: [timer("00:14:59", "00:14:58")] };
  const failed = fakePage("https://example.de/", first);
  failed.fresh = { ...emptySnapshot("https://example.de/"), error: "Timeout" };
  const one = await runFake(here, first, { pages: [failed] });
  assert.equal(one.status, "info");
  assert.equal(one.raw.details?.[0].key, "not_reloaded");
  const gone = fakePage("https://example.de/", first);
  gone.fresh = { ...emptySnapshot("https://example.de/"), status: 200 };
  assert.equal((await runFake(here, first, { pages: [gone] })).raw.details?.[0].key, "not_again");
});

test("gives info for a clock-shaped countdown that did not change", async () => {
  const result = await runFake(here, { timers: [timer("Endet in 00:14:59", "Endet in 00:14:59")] });
  assert.equal(result.status, "info");
  assert.equal(result.raw.details?.[0].key, "not_running");
});

test("gives info instead of no finding when a page did not load with JavaScript", async () => {
  const result = await runFake(here, {}, { pages: [fakePage("https://example.de/"), failedJsPage("https://example.de/sale")] });
  assert.equal(result.status, "info");
});

test("skips when no page loaded at all", async () => {
  assert.equal((await runFake(here, { status: 0 })).status, "skip");
});
