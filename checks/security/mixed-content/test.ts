import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeContext } from "../../../test/helpers.ts";
import check from "./check.ts";

const run = (...args: Parameters<typeof fakeContext>) => check.run(fakeContext(...args));

test("passes when everything uses HTTPS", async () => {
  const result = await run({ requests: [{ url: "https://example.de/app.js", host: "example.de", type: "script" }] });
  assert.equal(result.status, "pass");
});

test("fails for an http:// image on an HTTPS page", async () => {
  const result = await run({ requests: [{ url: "http://cdn.example.de/a.png", host: "cdn.example.de", type: "image" }] });
  assert.equal(result.status, "fail");
  assert.deepEqual(result.details, ["http://cdn.example.de/a.png on /"]);
});
