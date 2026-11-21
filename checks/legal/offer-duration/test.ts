import { test } from "node:test";
import assert from "node:assert/strict";
import { failedJsPage, runCheck, runFake } from "../../../test/helpers.ts";

const here = import.meta.dirname;
const sales = true;

test("gives info for a limited-time offer without its end", async () => {
  const result = await runCheck(here, "open", { sales });
  assert.equal(result.status, "info");
  assert.match(result.details[0], /nur heute/);
});

test("passes when the offer names its end in the next text block", async () => {
  const result = await runCheck(here, "dated", { sales });
  assert.equal(result.status, "pass");
  assert.match(result.message, /says when it ends/);
});

test("reads dates in words and English claims", async () => {
  assert.equal((await runFake(here, { text: "Sale endet bald\nNur für kurze Zeit, bis 31. Dezember" }, {}, { sales })).status, "pass");
  assert.equal((await runFake(here, { text: "Limited time offer\n20 % off" }, {}, { sales, languages: ["en"] })).status, "info");
});

test("passes without a limited-time claim", async () => {
  const result = await runFake(here, { text: "Kaffee 9,99 €" }, {}, { sales });
  assert.equal(result.status, "pass");
  assert.match(result.message, /No limited-time/);
});

// No pass on missing evidence: a page whose JavaScript load failed is read from its load without JavaScript.
test("reads a page whose JavaScript load failed from its load without JavaScript", async () => {
  const result = await runFake(here, { text: "Kaffee" }, { pages: [failedJsPage("https://example.de/sale", { text: "Nur heute: 20 %" })] }, { sales });
  assert.equal(result.status, "info");
});

test("skips when no page of the site loaded", async () => {
  assert.equal((await runFake(here, { status: 0 }, {}, { sales })).status, "skip");
});
