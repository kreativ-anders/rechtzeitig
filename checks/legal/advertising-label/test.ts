import { test } from "node:test";
import assert from "node:assert/strict";
import { failedJsPage, fakeLink, runCheck, runSite } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("warns for affiliate links without a label and names the networks", async () => {
  const result = await runCheck(here, "unlabelled");
  assert.equal(result.status, "warn");
  assert.match(result.details[0], /Amazon Associates, Awin/);
  assert.ok(result.details.some((d) => d.includes("tag=kaffeeblog-21")));
});

test("passes when the page labels its affiliate links; a plain shop link is no affiliate link", async () => {
  const result = await runCheck(here, "labelled");
  assert.equal(result.status, "pass");
  assert.match(result.message, /labels them as advertising/);
});

test("a label on the link itself counts, a cookie banner's \"Werbung\" does not", async () => {
  const labelled = fakeLink("Kaffeemühle (Anzeige)", "https://amzn.to/3abc");
  assert.equal((await runSite(here, { "/": { text: "Test", links: [labelled] } })).status, "pass");
  const plain = fakeLink("Kaffeemühle", "https://amzn.to/3abc");
  assert.equal((await runSite(here, { "/": { text: "Wir nutzen Cookies für Werbung.", links: [plain] } })).status, "warn");
});

test("passes without affiliate links", async () => {
  const result = await runSite(here, { "/": { text: "Kaffee", links: [fakeLink("Shop", "https://www.amazon.de/dp/B000")] } });
  assert.equal(result.status, "pass");
  assert.match(result.message, /No affiliate links/);
});

// No pass on missing evidence: a page whose load with JavaScript failed is read from its load without JavaScript.
test("reads a page whose JavaScript load failed from its load without JavaScript", async () => {
  const page = failedJsPage("https://example.de/test", { text: "Test", links: [fakeLink("Kaufen", "https://amzn.to/3abc")] });
  const { runFake } = await import("../../../test/helpers.ts");
  const result = await runFake(here, { text: "Start" }, { pages: [page] });
  assert.equal(result.status, "warn");
});

test("skips when no page of the site loaded", async () => {
  const { runFake } = await import("../../../test/helpers.ts");
  assert.equal((await runFake(here, { status: 0 })).status, "skip");
});
