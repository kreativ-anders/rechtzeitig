import { test } from "node:test";
import assert from "node:assert/strict";
import { runCrossCheck, siteFromFiles } from "../../../test/helpers.ts";

const here = import.meta.dirname;

const id = ["G", "4K7Q2ZP9XM"].join("-");
const gtag = `<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>`;
const page = (head = "", body = "Hallo") => siteFromFiles({ "index.html": `<html lang="de"><head>${head}</head><body>${body}</body></html>` });
const layout = { "src/app/layout.tsx": `export const GA = "${id}";\nexport default function Layout() { return null; }` };

test("fails when the id from the code is requested before consent, at its line", async () => {
  const result = await runCrossCheck(here, await page(gtag), layout);
  assert.equal(result.status, "fail");
  assert.deepEqual(result.details, [`src/app/layout.tsx:1: Google Analytics ${id}: configured here, sent before consent on /.`]);
});

test("warns for an id not loaded on the visited pages when there is no consent tool anywhere", async () => {
  const result = await runCrossCheck(here, await page(), { ...layout, ".env.production": "NEXT_PUBLIC_PIXEL=1" });
  assert.equal(result.status, "warn");
  assert.match(result.message, /neither the site nor the repository has a consent tool/);
});

test("passes when the id is not loaded and the repository has a consent tool", async () => {
  const result = await runCrossCheck(here, await page(), { ...layout, "package.json": '{"dependencies":{"vanilla-cookieconsent":"3"}}' });
  assert.equal(result.status, "pass");
});

test("fails when the served code carries the id and the vendor's script loads, without the id in a URL", async () => {
  const ua = ["UA", "12875225", "1"].join("-");
  const head = `<script>ga('create', '${ua}', 'auto');</script><script async src="https://www.google-analytics.com/analytics.js"></script>`;
  const result = await runCrossCheck(here, await page(head), { "src/index.tsx": `ga('create', '${ua}', 'auto');` });
  assert.equal(result.status, "fail");
});

test("ignores placeholder ids without a digit, tests and Markdown", async () => {
  const files = {
    "src/config.ts": 'export const GA = "G-XXXXXXXXXX";',
    "src/config.test.ts": `const ga = "${id}";`,
    "README.md": `Set ${id}`,
  };
  assert.equal((await runCrossCheck(here, await page(gtag), files)).status, "skip");
});

test("gives info, not pass, when it found no id but could not read some code", async () => {
  const result = await runCrossCheck(here, await page(), { "src/app.js": "console.log(1);", "src/big.js": "x".repeat(1_100_000) });
  assert.equal(result.status, "info");
});
