import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { fakeContext, fakeLink, fakePage, failedJsPage, runCheck, runSite } from "../../../test/helpers.ts";
import { importCheck } from "../../../src/runner.ts";
import type { Check } from "../../../src/sdk.ts";

const here = import.meta.dirname;
const sales = true;

test("warns for review markup and a count without a note on how reviews are checked", async () => {
  const result = await runCheck(here, "missing", { sales });
  assert.equal(result.status, "warn");
  assert.deepEqual(result.raw.details?.map((d) => d.key), ["no_note_markup"]);
});

test("passes when the FAQ explains how reviews are checked", async () => {
  const result = await runCheck(here, "noted", { sales });
  assert.equal(result.status, "pass");
  assert.match(result.message, /\/faq/);
});

test("a note next to the reviews counts too", async () => {
  const result = await runSite(here, { "/": { text: "Kaffee 4,8 von 5 Sternen. Verifizierter Kauf." } }, {}, { sales });
  assert.equal(result.status, "pass");
});

test("gives info when only a review widget shows reviews: its note may be inside its iframe", async () => {
  const requests = [{ url: "https://widget.trustpilot.com/bootstrap.js", host: "widget.trustpilot.com", type: "script" }];
  const result = await runSite(here, { "/": { text: "Kaffee", requests } }, {}, { sales });
  assert.equal(result.status, "info");
  assert.match(result.details[0], /Trustpilot/);
});

test("skips a site without reviews", async () => {
  assert.equal((await runSite(here, { "/": { text: "Kaffee 9,99 €" } }, {}, { sales })).status, "skip");
});

// Evidence gap: the note can be in T&Cs or FAQ that were linked but not read.
test("gives info instead of a warning when the linked T&Cs could not be read", async () => {
  const links = [fakeLink("AGB", "https://example.de/agb")];
  const result = await runSite(here, { "/": { text: "Kaffee 124 Bewertungen", links } }, {}, { sales });
  assert.equal(result.status, "info");
  assert.match(result.details.join("\n"), /AGB\) at \/agb could not be read/);
});

test("gives info when the FAQ is linked but was not visited; a FAQ whose JavaScript load failed is read without JavaScript", async () => {
  const links = [fakeLink("FAQ", "https://example.de/faq")];
  const start = { text: "Kaffee 124 Bewertungen", links };
  assert.equal((await runSite(here, { "/": start }, {}, { sales })).status, "info");
  const home = fakePage("https://example.de/", start);
  const faq = failedJsPage("https://example.de/faq", { text: "Bewertungen werden nicht geprüft." });
  const check = await importCheck<Check>(join(here, "check.ts"));
  assert.equal((await check.run(fakeContext(home.js, { pages: [home, faq] }, { sales }))).status, "pass");
});
