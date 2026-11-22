import { test } from "node:test";
import assert from "node:assert/strict";
import { failedJsPage, fakePage, runCheck, runFake } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("warns for a notification prompt on load and names the script", async () => {
  const result = await runCheck(here, "prompt");
  assert.equal(result.status, "warn");
  assert.equal(result.raw.details?.[0].params?.api, "Notification.requestPermission");
  assert.match(result.details[0], /\/push\.js/);
});

test("names the vendor of a third-party script", async () => {
  const prompts = [{ api: "PushManager.subscribe", script: "https://widget.trustpilot.com/sdk.js" }];
  const result = await runFake(here, { prompts });
  assert.match(result.details[0], /Trustpilot/);
});

test("passes when the prompt waits for a click", async () => {
  assert.equal((await runCheck(here, "clean")).status, "pass");
});

// Evidence gaps: prompts are recorded in the load with JavaScript.
test("gives info instead of no finding when a page did not load with JavaScript", async () => {
  const result = await runFake(here, {}, { pages: [fakePage("https://example.de/"), failedJsPage("https://example.de/news")] });
  assert.equal(result.status, "info");
});

test("skips when no page loaded at all", async () => {
  assert.equal((await runFake(here, { status: 0 })).status, "skip");
});
