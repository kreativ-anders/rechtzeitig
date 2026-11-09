import { test } from "node:test";
import assert from "node:assert/strict";
import { runFake } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes when everything uses HTTPS", async () => {
  const result = await runFake(here, { requests: [{ url: "https://example.de/app.js", host: "example.de", type: "script" }] });
  assert.equal(result.status, "pass");
});

test("fails for an http:// image on an HTTPS page", async () => {
  const result = await runFake(here, { requests: [{ url: "http://cdn.example.de/a.png", host: "cdn.example.de", type: "image" }] });
  assert.equal(result.status, "fail");
  assert.deepEqual(result.details, ["http://cdn.example.de/a.png on /"]);
});

test("skips a site without HTTPS", async () => {
  assert.equal((await runFake(here, { finalUrl: "http://example.de/" })).status, "skip");
});
