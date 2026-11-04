import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { capture } from "./capture.ts";
import { serve, testBrowser } from "../test/helpers.ts";

const browser = testBrowser();
after(async () => (await browser).close());

const site = (html: string) => {
  const dir = mkdtempSync(join(tmpdir(), "rechtzeitig-capture-"));
  writeFileSync(join(dir, "index.html"), html);
  return serve(dir);
};

test("text, links and link labels are capped", async () => {
  const s = await site(`<p>${"x ".repeat(150_000)}</p>${`<a href="/a">${"y".repeat(1000)}</a>`.repeat(3000)}`);
  const context = await (await browser).newContext({ javaScriptEnabled: false });
  try {
    const snap = await capture(context, s.url, false, 10_000);
    assert.equal(snap.text.length, 200_000);
    assert.equal(snap.links.length, 2000);
    assert.equal(snap.links[0].text.length, 300);
  } finally {
    await context.close();
    s.close();
  }
});

test("a page that never yields ends with an error instead of blocking the scan", async () => {
  const s = await site(`<p>busy</p><script>addEventListener("load", () => setTimeout(() => { for (;;) {} }, 0));</script>`);
  const context = await (await browser).newContext();
  try {
    const started = Date.now();
    const snap = await capture(context, s.url, true, 500);
    assert.equal(snap.status, 0);
    assert.match(snap.error ?? "", /did not finish/);
    assert.ok(Date.now() - started < 15_000);
  } finally {
    await context.close();
    s.close();
  }
});
