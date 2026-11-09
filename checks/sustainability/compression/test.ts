import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck, runFake } from "../../../test/helpers.ts";

const here = import.meta.dirname;
const file = (extra: Record<string, unknown> = {}) => ({
  url: "https://example.de/app.js", host: "example.de", type: "script", status: 200, contentType: "text/javascript", contentLength: 5000, ...extra,
});

// The files in fixtures/compressed are stored gzipped and served with Content-Encoding: gzip.
test("passes when own text files come gzipped", async () => {
  const result = await runCheck(here, "compressed");
  assert.equal(result.status, "pass");
  assert.match(result.message, /^All 3 /);
});

test("warns for own HTML, CSS and JavaScript without compression, but not for tiny files", async () => {
  const result = await runCheck(here, "uncompressed");
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details.sort(), ["/", "/app.js", "/style.css"]);
});

test("counts a text file of unknown size, and accepts brotli", async () => {
  assert.equal((await runFake(here, { requests: [file({ contentLength: undefined })] })).status, "warn");
  assert.equal((await runFake(here, { requests: [file({ contentEncoding: "br" })] })).status, "pass");
});

test("skips without own text answers: other sites, images, errors", async () => {
  const requests = [
    file({ url: "https://cdn.other.com/a.js", host: "cdn.other.com" }),
    file({ url: "https://example.de/a.png", contentType: "image/png" }),
    file({ url: "https://example.de/gone.js", status: 404 }),
  ];
  assert.equal((await runFake(here, { requests })).status, "skip");
});

test("leaves out files below 1024 bytes", async () => {
  assert.equal((await runFake(here, { requests: [file({ contentLength: 1023 })] })).status, "skip");
  assert.equal((await runFake(here, { requests: [file({ contentLength: 600 })] })).status, "skip");
  assert.equal((await runFake(here, { requests: [file({ contentLength: 1024 })] })).status, "warn");
});
