import { test } from "node:test";
import assert from "node:assert/strict";
import { failedJsPage, fakeContext, fakePage, runCrossCheck, TOO_LARGE } from "../../../test/helpers.ts";

const here = import.meta.dirname;
const site = () => fakeContext({ text: "Kaffee" });

test("warns for Math.random next to a viewer claim, with file and line", async () => {
  const code = "const viewers = Math.floor(Math.random() * 20) + 5;\nbadge.textContent = `${viewers} Personen sehen sich diesen Artikel gerade an`;\n";
  const result = await runCrossCheck(here, site(), { "src/badge.js": code });
  assert.equal(result.status, "warn");
  assert.deepEqual(result.raw.details?.map((d) => [d.file, d.line, d.key]), [["src/badge.js", 1, "random_claim"]]);
});

test("reads concatenated strings and PHP templates, also in English", async () => {
  const js = "const n = Math.floor(Math.random() * 9);\nel.innerText = 'Only ' + n + ' left in stock';\n";
  const php = "<?php $n = rand(2, 9); ?>\n<p>Nur noch <?= $n ?> Stück verfügbar</p>\n";
  const result = await runCrossCheck(here, fakeContext({ text: "Shop" }, {}, { languages: ["de", "en"] }), { "a.js": js, "b.php": php });
  assert.equal(result.status, "warn");
  assert.equal(result.raw.details?.length, 2);
});

test("a stock number from the server and a random id elsewhere give no finding", async () => {
  const code = "const id = Math.random().toString(36);\n\n\n\n\n\n\n\nconst stock = await api.stock(sku);\nel.textContent = `Nur noch ${stock} Stück auf Lager`;\n";
  const result = await runCrossCheck(here, "clean", { "src/stock.js": code });
  assert.equal(result.status, "pass");
});

test("gives info for a social-proof pop-up on the site", async () => {
  const result = await runCrossCheck(here, "widget", { "src/app.js": "export const x = 1;\n" });
  assert.equal(result.status, "info");
  assert.match(result.details.join("\n"), /Fomo/);
});

test("skips without code it reads", async () => {
  assert.equal((await runCrossCheck(here, site(), { "README.md": "# Shop" })).status, "skip");
});

// Evidence gaps: no pass when a file or a page could not be read.
test("gives info instead of no finding when a code file is too large", async () => {
  const result = await runCrossCheck(here, site(), { "src/app.js": "export const x = 1;\n", "src/big.js": TOO_LARGE });
  assert.equal(result.status, "info");
});

test("gives info instead of no finding when a page did not load with JavaScript", async () => {
  const home = fakePage("https://example.de/", { text: "Shop" });
  const withFailed = fakeContext(home.js, { pages: [home, failedJsPage("https://example.de/shop", { text: "Shop" })] });
  const result = await runCrossCheck(here, withFailed, { "src/app.js": "export const x = 1;\n" });
  assert.equal(result.status, "info");
  assert.match(result.message, /did not load with JavaScript/);
});
