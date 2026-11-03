import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { capture } from "./capture.ts";
import { serve } from "../test/helpers.ts";

const browser = chromium.launch();
after(async () => (await browser).close());

const site = (html: string) => {
  const dir = mkdtempSync(join(tmpdir(), "rechtzeitig-capture-"));
  writeFileSync(join(dir, "index.html"), html);
  return serve(dir);
};

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
