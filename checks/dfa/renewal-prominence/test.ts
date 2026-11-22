import { test } from "node:test";
import assert from "node:assert/strict";
import { failedJsPage, fakePage, runCheck, runFake } from "../../../test/helpers.ts";
import type { OfferText } from "../../../src/sdk.ts";

const here = import.meta.dirname;
const subscriptions = true;
const block = (text: string, fontSize = 16, color = "rgb(0, 0, 0)"): OfferText => ({ text, fontSize, maxFontSize: fontSize, color, background: "rgb(255, 255, 255)" });

test("warns when the renewal terms are only in fine print next to the price", async () => {
  const result = await runCheck(here, "fineprint", { subscriptions });
  assert.equal(result.status, "warn", result.message);
  assert.equal(result.raw.details?.[0].key, "small");
  assert.match(result.details[0], /verlängert sich automatisch/);
});

test("passes when the terms also stand in normal text next to the price", async () => {
  assert.equal((await runCheck(here, "clear", { subscriptions })).status, "pass");
});

test("gives info when a subscription price names no renewal or trial terms", async () => {
  const result = await runCheck(here, "missing", { subscriptions });
  assert.equal(result.status, "info");
  assert.equal(result.raw.details?.[0].key, "missing");
});

test("warns for terms in a faint colour, in English too", async () => {
  const offers = { textSize: 16, blocks: [block("€9.99/month"), block("Renews automatically. Cancel anytime.", 16, "rgb(210, 210, 210)")] };
  const result = await runFake(here, { offers }, {}, { subscriptions, languages: ["en"] });
  assert.equal(result.status, "warn");
  assert.equal(result.raw.details?.[0].key, "faint");
});

test("a price without a period is no subscription price", async () => {
  const offers = { textSize: 16, blocks: [block("9,99 €", 40)] };
  assert.equal((await runFake(here, { offers }, {}, { subscriptions })).status, "skip");
});

// No pass on missing evidence: the styles come from the load with JavaScript.
test("gives info instead of no finding when a page did not load with JavaScript", async () => {
  const offers = { textSize: 16, blocks: [block("9,99 € / Monat", 40), block("Monatlich kündbar")] };
  const result = await runFake(here, {}, { pages: [fakePage("https://example.de/", { offers }), failedJsPage("https://example.de/preise")] }, { subscriptions });
  assert.equal(result.status, "info");
});

test("skips when no page loaded at all", async () => {
  assert.equal((await runFake(here, { status: 0 }, {}, { subscriptions })).status, "skip");
});
