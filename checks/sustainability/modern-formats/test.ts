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
