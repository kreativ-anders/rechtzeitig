import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { capture, CodeCollector } from "./capture.ts";
import { loadYaml } from "./sdk.ts";
import { serve, testBrowser } from "../test/helpers.ts";

const browser = testBrowser();
after(async () => (await browser).close());

const site = (html: string) => {
  const dir = mkdtempSync(join(tmpdir(), "rechtzeitig-capture-"));
  writeFileSync(join(dir, "index.html"), html);
  return serve(dir);
};

test("runs the selected axe-core rules with JavaScript on, also under a strict CSP, and caps the elements", async () => {
  const html = `<!doctype html><html lang="de"><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'"><title>T</title></head>
<body>${'<img src="data:,">'.repeat(30)}<button></button></body></html>`;
  const s = await site(html);
  const on = await (await browser).newContext();
  const off = await (await browser).newContext({ javaScriptEnabled: false });
  try {
    const snap = await capture(on, s.url, true, 10_000);
    const alt = snap.axe?.find((v) => v.rule === "image-alt");
    assert.equal(alt?.count, 30);
    assert.equal(alt?.targets.length, 20);
    assert.ok(snap.axe?.some((v) => v.rule === "button-name"));
    // A rule outside data/accessibility.yml does not run.
    assert.ok(!snap.axe?.some((v) => v.rule === "region"));
    assert.equal((await capture(off, s.url, false, 10_000)).axe, undefined);
  } finally {
    await on.close();
    await off.close();
    s.close();
  }
});

test("every own axe-core rule in data/accessibility.yml belongs to a check", () => {
  const a11y = loadYaml<{ rules: Record<string, string[]>; custom: Record<string, string> }>("data/accessibility.yml");
  const listed = Object.values(a11y.rules).flat();
  for (const id of Object.keys(a11y.custom)) assert.ok(listed.includes(id), `${id} is in custom but in no check`);
});

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
    const snap = await capture(context, s.url, true, 500, undefined, 500);
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

// Audit 2026-11-10: concurrent responses must not pass max_files while their bodies are still being read.

const LIMIT = loadYaml<{ code: { max_files: number; max_file_chars: number } }>("data/thresholds.yml").code;
type Fake = Parameters<CodeCollector["take"]>[0];
const response = (url: string, body: string | Error, headers: Record<string, string> = {}) =>
  ({
    url: () => url,
    status: () => 200,
    headers: () => headers,
    finished: () => Promise.resolve(null),
    text: () => new Promise<string>((done, fail) => setTimeout(() => (body instanceof Error ? fail(body) : done(body)), 5)),
  }) as unknown as Fake;

test("CodeCollector keeps at most max_files of concurrent responses and counts the rest", async () => {
  const code = new CodeCollector();
  const total = LIMIT.max_files + 20;
  await Promise.all(Array.from({ length: total }, (_, i) => code.take(response(`https://example.de/${i}.js`, "x"), "script")));
  assert.equal(code.files.length, LIMIT.max_files);
  assert.equal(code.skipped, total - LIMIT.max_files);
});

test("CodeCollector frees the slot of a failed read and keeps each URL once", async () => {
  const code = new CodeCollector();
  await Promise.all([
    code.take(response("https://example.de/broken.js", new Error("gone")), "script"),
    code.take(response("https://example.de/a.js", "a"), "script"),
    code.take(response("https://example.de/a.js", "a"), "script"),
  ]);
  assert.deepEqual(code.files.map((f) => f.url), ["https://example.de/a.js"]);
  assert.equal(code.skipped, 0);
  await Promise.all(Array.from({ length: LIMIT.max_files }, (_, i) => code.take(response(`https://example.de/${i}.js`, "x"), "script")));
  assert.equal(code.files.length, LIMIT.max_files);
});

test("CodeCollector does not read a body announced larger than max_file_chars can hold", async () => {
  const code = new CodeCollector();
  const big = { "content-length": String(LIMIT.max_file_chars * 4 + 1) };
  await code.take(response("https://example.de/big.js", "x", big), "script");
  assert.equal(code.files.length, 0);
  assert.equal(code.skipped, 1);
});

// Issue #55: a response without Content-Length (chunked) is bounded by the bytes counted while they arrive.
test("CodeCollector does not read a body that arrived larger than the limit, with no Content-Length", async () => {
  const code = new CodeCollector(100); // test-only limit: 100 chars, so 400 bytes
  let reads = 0;
  const res = {
    url: () => "https://example.de/big.js",
    status: () => 200,
    headers: () => ({}),
    finished: () => Promise.resolve(null),
    text: () => {
      reads++;
      return Promise.resolve("x".repeat(1000));
    },
  } as unknown as Fake;
  await code.take(res, "script", () => 401);
  assert.equal(code.files.length, 0);
  assert.equal(code.skipped, 1);
  assert.equal(reads, 0, "text() is never called for an over-limit body");
});

test("CodeCollector reads a chunked body within the limit", async () => {
  const code = new CodeCollector(100);
  const res = { ...response("https://example.de/ok.js", "hello"), finished: () => Promise.resolve(null) } as unknown as Fake;
  await code.take(res, "script", () => 5);
  assert.deepEqual(code.files.map((f) => [f.url, f.body]), [["https://example.de/ok.js", "hello"]]);
  assert.equal(code.skipped, 0);
});

test("a chunked script larger than the limit is skipped and not kept", async () => {
  const code = new CodeCollector(100); // test-only limit: 100 chars, so 400 bytes
  const server = createServer((req, res) => {
    if (req.url === "/big.js") {
      res.writeHead(200, { "content-type": "application/javascript", "transfer-encoding": "chunked" });
      res.end("x".repeat(500));
    } else {
      res.writeHead(200, { "content-type": "text/html" });
      res.end('<script src="/big.js"></script>');
    }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const port = (server.address() as AddressInfo).port;
  const context = await (await browser).newContext();
  try {
    await capture(context, `http://127.0.0.1:${port}/`, true, 10_000, code, 500);
    assert.ok(!code.files.some((f) => f.url.endsWith("/big.js")), "big.js is not kept");
    assert.equal(code.skipped, 1);
  } finally {
    await context.close();
    server.close();
  }
});
