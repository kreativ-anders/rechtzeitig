import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck, runFake } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes for WebP, SVG and WOFF2", async () => {
  assert.equal((await runCheck(here, "modern")).status, "pass");
});

test("warns for JPEG, PNG and TTF, but not for the favicon", async () => {
  const result = await runCheck(here, "legacy");
  assert.equal(result.status, "warn");
  assert.deepEqual(result.raw.details?.map((d) => `${d.key} ${(d.params?.url as string)}`).sort(), [
    "font /font.ttf",
    "image /logo.png",
    "image /photo.jpg",
  ]);
});

test("uses the extension when no Content-Type came", async () => {
  const requests = [{ url: "https://example.de/a.gif", host: "example.de", type: "image" }];
  assert.equal((await runFake(here, { requests })).status, "warn");
});

test("trusts the Content-Type over the extension", async () => {
  const requests = [{ url: "https://example.de/a.jpg", host: "example.de", type: "image", status: 200, contentType: "image/avif" }];
  assert.equal((await runFake(here, { requests })).status, "pass");
});

const asked = (url: string, extra: Record<string, unknown> = {}) =>
  runFake(here, { requests: [{ url, host: new URL(url).hostname, type: "image", status: 200, ...extra }] });

test("leaves out other sites, error answers and icons", async () => {
  assert.equal((await asked("https://cdn.example.com/a.png")).status, "pass");
  assert.equal((await asked("https://example.de/a.png", { status: 400 })).status, "pass");
  assert.equal((await asked("https://example.de/a.png", { status: 399 })).status, "warn");
  for (const icon of ["favicon-32.png", "apple-touch-icon.png", "android-chrome-192.png", "mstile-150.png"]) {
    assert.equal((await asked(`https://example.de/${icon}`)).status, "pass", icon);
  }
});

test("knows every legacy type and extension in data/file-formats.yml", async () => {
  for (const type of ["image/gif", "font/otf", "font/sfnt", "application/x-font-ttf", "application/x-font-otf", "application/x-font-truetype",
    "application/x-font-opentype", "application/font-sfnt"]) {
    assert.equal((await asked("https://example.de/file", { contentType: type })).status, "warn", type);
  }
  for (const ext of ["jpg", "jpeg", "png", "ttf", "otf"]) assert.equal((await asked(`https://example.de/file.${ext}`)).status, "warn", ext);
});
