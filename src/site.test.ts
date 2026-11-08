// Checks docs/: hreflang pairs, canonicals, the sitemap, one CSP and one header seal for all pages.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const DOCS = new URL("../docs/", import.meta.url);
const SITE = "https://rechtzeitig.dev/";
const pages = readdirSync(DOCS, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".html")).map((f) => f.replaceAll("\\", "/"));
const read = (f: string) => readFileSync(new URL(f, DOCS), "utf8");
const urlOf = (f: string) => SITE + f.replace(/(^|\/)index\.html$/, "$1");
const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1];

/** hreflang → href of every <link rel="alternate" hreflang> on a page. */
const alternates = (html: string): Record<string, string> =>
  Object.fromEntries([...html.matchAll(/<link rel="alternate" hreflang="[^"]+" href="[^"]+">/g)].map(([t]) => [attr(t, "hreflang")!, attr(t, "href")!]));

const indexed = pages.filter((f) => f !== "404.html");

test("every page has a self canonical, and pairs link each other with en, de and x-default", () => {
  for (const f of indexed) {
    const html = read(f);
    const canonical = attr(html.match(/<link rel="canonical"[^>]*>/)?.[0] ?? "", "href");
    assert.equal(canonical, urlOf(f), `${f}: canonical`);
    const alt = alternates(html);
    if (!Object.keys(alt).length) continue;
    const lang = html.match(/<html lang="(\w+)"/)![1];
    assert.deepEqual(Object.keys(alt).sort(), ["de", "en", "x-default"], f);
    assert.ok(Object.values(alt).every((u) => u.startsWith(SITE)), `${f}: absolute URLs`);
    assert.equal(alt[lang], canonical, `${f}: hreflang="${lang}" points to itself`);
    assert.equal(alt["x-default"], alt.en, `${f}: x-default is the English page`);
    const other = alt[lang === "en" ? "de" : "en"];
    assert.deepEqual(alternates(read(other.slice(SITE.length).replace(/(^|\/)$/, "$1index.html"))), alt, `${f}: reciprocal with ${other}`);
  }
});

test("the sitemap lists every page with the same alternates", () => {
  const xml = readFileSync(new URL("sitemap.xml", DOCS), "utf8");
  const entries = [...xml.matchAll(/<url>(.*?)<\/url>/gs)].map(([, body]) => ({
    loc: body.match(/<loc>(.*?)<\/loc>/)![1],
    alt: Object.fromEntries([...body.matchAll(/<xhtml:link rel="alternate" hreflang="([^"]+)" href="([^"]+)"\/>/g)].map((m) => [m[1], m[2]])),
  }));
  assert.deepEqual(entries.map((e) => e.loc).sort(), indexed.map(urlOf).sort());
  for (const e of entries) {
    const f = indexed.find((p) => urlOf(p) === e.loc)!;
    assert.deepEqual(e.alt, alternates(read(f)), e.loc);
  }
});

test("every page has the same Content-Security-Policy", () => {
  const csp = (f: string) => read(f).match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)?.[1];
  const first = csp("index.html");
  assert.ok(first);
  for (const f of pages) assert.equal(csp(f), first, f);
});

test("every page's header seal is the one in index.html, drawn as a path without <text>", () => {
  // A <text> glyph sits at a different height in every font; an outline stays centred.
  const seal = (f: string) => read(f).match(/<a class="brand"[^>]*>(<svg[\s\S]*?<\/svg>)/)?.[1];
  const first = seal("index.html");
  assert.ok(first?.includes("<path ") && !first.includes("<text"), "index.html: the seal is a path");
  for (const f of pages) assert.equal(seal(f), first, f);
  assert.ok(!readFileSync(new URL("favicon.svg", DOCS), "utf8").includes("<text"), "favicon.svg has no <text>");
  const path = first!.match(/<path d="[^"]+"\/>/)![0];
  for (const f of ["index.html", "de/index.html"]) assert.ok(read(f).match(/<svg class="mark"[^>]*>(.*?)<\/svg>/)?.[1] === path, `${f}: the stamp's § is the seal's path`);
});
