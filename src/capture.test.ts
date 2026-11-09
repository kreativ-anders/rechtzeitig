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
    // Deadline 2 × 500 + 500 ms. The busy page blocks page.evaluate, so only the deadline ends the load.
    const snap = await capture(context, s.url, true, 500, 500);
    assert.equal(snap.status, 0);
    assert.match(snap.error ?? "", /did not finish/);
    assert.ok(Date.now() - started < 10_000);
  } finally {
    await context.close();
    s.close();
  }
});

test("records subresources, images, videos, cookie expiry and banner button styles", async () => {
  const s = await site(`<!doctype html><body style="margin:0">
<link rel="stylesheet" href="/a.css" integrity="sha384-x"><script src="/b.js"></script>
<div id="cookie-banner" style="background:#000"><button style="background:transparent;color:#fff;width:200px;height:40px;font-size:16px">OK</button></div>
<img src="/top.png" width="10" height="10"><div style="height:2000px"></div><img src="/low.png" loading="LAZY">
<video src="/v.mp4" autoplay muted loop></video>
<script>document.cookie = "long=1; max-age=86400"</script></body>`);
  const context = await (await browser).newContext();
  try {
    const snap = await capture(context, s.url, true, 10_000);
    assert.deepEqual(snap.subresources.map((r) => [new URL(r.url).pathname, r.type, r.integrity]), [["/a.css", "stylesheet", true], ["/b.js", "script", false]]);
    assert.deepEqual(snap.images.map((i) => [new URL(i.url).pathname, i.loading, i.belowFold]), [["/top.png", "", false], ["/low.png", "lazy", true]]);
    assert.deepEqual(snap.videos.map((v) => [v.autoplay, v.muted, v.controls, v.loop]), [[true, true, false, true]]);
    const button = snap.links.find((l) => l.text === "OK");
    assert.deepEqual(button?.style, { width: 200, height: 40, fontSize: 16, color: "rgb(255, 255, 255)", background: "rgb(0, 0, 0)" });
    const cookie = snap.cookies.find((c) => c.name === "long");
    assert.ok(cookie && cookie.expires > Date.now() / 1000 + 80_000);
  } finally {
    await context.close();
    s.close();
  }
});
