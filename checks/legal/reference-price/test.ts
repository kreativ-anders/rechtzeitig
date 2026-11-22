import { test } from "node:test";
import assert from "node:assert/strict";
import { failedJsPage, fakeLink, fakePage, runCheck, runFake } from "../../../test/helpers.ts";

const here = import.meta.dirname;
const sales = true;

test("gives info for a price struck through against the RRP", async () => {
  const result = await runCheck(here, "rrp", { sales });
  assert.equal(result.status, "info");
  assert.match(result.details[0], /129,00 €/);
});

test("passes for a reduction of the own price with the 30-day lowest price", async () => {
  assert.equal((await runCheck(here, "lowest", { sales })).status, "pass");
});

test("skips without a shop page", async () => {
  assert.equal((await runFake(here, { text: "UVP 129,00 €", links: [fakeLink("Kontakt")] }, {}, { sales })).status, "skip");
});

// Evidence gap: struck-through prices come from the rendered page.
test("gives info instead of no finding when a page did not load with JavaScript", async () => {
  const start = { text: "Kaffee 8,99 € inkl. MwSt.", links: [fakeLink("In den Warenkorb")] };
  const result = await runFake(here, start, { pages: [fakePage("https://example.de/", start), failedJsPage("https://example.de/sale")] }, { sales });
  assert.equal(result.status, "info");
});
