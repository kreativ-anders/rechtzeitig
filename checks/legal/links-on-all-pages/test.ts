import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck, runFake } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes when every page has both links", async () => {
  assert.equal((await runCheck(here, "good")).status, "pass");
});

test("warns and names the page without links", async () => {
  const result = await runCheck(here, "gap");
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, ["/ueber-uns: no link to the imprint or privacy policy"]);
});

test("gives info when only the start page was read", async () => {
  assert.equal((await runFake(here)).status, "info");
});

// #87: a page whose load with JavaScript failed is read from its load without JavaScript.
test("reads a page whose JavaScript load failed from its load without JavaScript", async () => {
  const { failedJsPage, fakeContext, fakeLink, fakePage, rendered } = await import("../../../test/helpers.ts");
  const legal = [fakeLink("Impressum", "https://example.de/impressum", "footer"), fakeLink("Datenschutz", "https://example.de/datenschutz", "footer")];
  const start = fakePage("https://example.de/", { links: legal });
  const { default: check } = await import("./check.ts");
  const run = async (blog: ReturnType<typeof fakePage>) => rendered(here, await check.run(fakeContext(start.js, { start, pages: [start, blog] })));
  assert.equal((await run(failedJsPage("https://example.de/blog", { links: legal }))).status, "pass");
  const gap = await run(failedJsPage("https://example.de/blog"));
  assert.equal(gap.status, "warn");
  assert.deepEqual(gap.details, ["/blog: no link to the imprint or privacy policy"]);
});
