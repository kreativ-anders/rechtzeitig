import { test } from "node:test";
import assert from "node:assert/strict";
import { failedJsPage, fakePage, runCheck, runFake } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("warns when the page changes its title to a message count on its own", async () => {
  const result = await runCheck(here, "title");
  assert.equal(result.status, "warn");
  assert.equal(result.raw.details?.[0].key, "changed");
  assert.match(result.details[0], /\(1\) Neue Nachricht/);
});

test("a title that claims a message at load counts too", async () => {
  const result = await runFake(here, { titles: ["(3) Mein Shop"] });
  assert.equal(result.raw.details?.[0].key, "at_load");
});

test("passes for a title change without a message", async () => {
  assert.equal((await runCheck(here, "clean")).status, "pass");
});

// Evidence gaps: titles come from the load with JavaScript.
test("gives info instead of no finding when a page did not load with JavaScript", async () => {
  const result = await runFake(here, { titles: ["Shop"] }, { pages: [fakePage("https://example.de/", { titles: ["Shop"] }), failedJsPage("https://example.de/shop")] });
  assert.equal(result.status, "info");
  assert.match(result.message, /did not load with JavaScript/);
});

test("skips when no page loaded at all", async () => {
  assert.equal((await runFake(here, { status: 0 })).status, "skip");
});
