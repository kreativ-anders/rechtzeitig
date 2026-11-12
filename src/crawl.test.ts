import { test } from "node:test";
import assert from "node:assert/strict";
import { siteFromFiles } from "../test/helpers.ts";

// A site whose start page is English and announces a German version via hreflang.
const multilingual = {
  "index.html": `<html lang="en"><head><link rel="alternate" hreflang="de" href="/de/"></head><body><footer><a href="/privacy">Privacy Policy</a></footer></body></html>`,
  "privacy.html": `<html lang="en"><body>Privacy policy. ${"Personal data is processed. ".repeat(10)}</body></html>`,
  "de/index.html": `<html lang="de"><head><link rel="alternate" hreflang="en" href="/"></head><body><footer><a href="/de/datenschutz">Datenschutzerklärung</a></footer></body></html>`,
  "de/datenschutz.html": `<html lang="de"><body>Datenschutzerklärung. ${"Personenbezogene Daten werden verarbeitet. ".repeat(10)}</body></html>`,
};

test("follows hreflang to the legal pages of the scan language", async () => {
  const ctx = await siteFromFiles(multilingual); // default language: de
  const found = ctx.legalPage("privacy");
  assert.ok(found, "the German scan finds a privacy link");
  assert.equal(new URL(found.link.href!).pathname, "/de/datenschutz");
  assert.equal(found.page?.js.status, 200, "/de/datenschutz was visited and loaded");
  assert.ok(ctx.pages.some((p) => new URL(p.url).pathname === "/de/"), "the German start page was visited");
});

test("without an alternate in the scan language, the start page's own links count", async () => {
  const ctx = await siteFromFiles(multilingual, { language: "en" });
  const found = ctx.legalPage("privacy");
  assert.ok(found, "the English scan finds a privacy link");
  assert.equal(new URL(found.link.href!).pathname, "/privacy");
});

test("a regional hreflang (de-AT) counts as the scan language de", async () => {
  const ctx = await siteFromFiles({
    ...multilingual,
    "index.html": multilingual["index.html"].replace('hreflang="de"', 'hreflang="de-AT"'),
  });
  const found = ctx.legalPage("privacy");
  assert.ok(found);
  assert.equal(new URL(found.link.href!).pathname, "/de/datenschutz");
});

test("an hreflang pointing to the start page itself is not visited again", async () => {
  const ctx = await siteFromFiles({
    "index.html": `<html lang="de"><head><link rel="alternate" hreflang="de" href="/"></head><body><footer><a href="/datenschutz">Datenschutzerklärung</a></footer></body></html>`,
    "datenschutz.html": `<html lang="de"><body>Datenschutzerklärung. ${"Personenbezogene Daten werden verarbeitet. ".repeat(10)}</body></html>`,
  });
  const found = ctx.legalPage("privacy");
  assert.ok(found);
  assert.equal(new URL(found.link.href!).pathname, "/datenschutz");
  assert.equal(ctx.pages.filter((p) => p.url === ctx.url).length, 1, "the start page is in pages exactly once");
});

test("an hreflang to another site is not visited", async () => {
  const ctx = await siteFromFiles({
    "index.html": `<html lang="en"><head><link rel="alternate" hreflang="de" href="https://example.de/"></head><body><footer><a href="/privacy">Privacy Policy</a></footer></body></html>`,
    "privacy.html": multilingual["privacy.html"],
  }, { language: "en" });
  assert.equal(ctx.pages.some((p) => new URL(p.url).hostname === "example.de"), false);
  assert.equal(new URL(ctx.legalPage("privacy")!.link.href!).pathname, "/privacy");
});

test("the hreflang version counts against max-pages", async () => {
  const ctx = await siteFromFiles(multilingual, { maxPages: 1 });
  assert.equal(ctx.pages.length, 1);
});
