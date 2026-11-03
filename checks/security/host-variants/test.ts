import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeContext } from "../../../test/helpers.ts";
import check from "./check.ts";

const run = (...args: Parameters<typeof fakeContext>) => check.run(fakeContext(...args));

test("passes when www redirects", async () => {
  const result = await run({}, { variant: { url: "https://www.example.de/", status: 200, finalUrl: "https://example.de/" } });
  assert.equal(result.status, "pass");
});

test("warns when the variant has a broken certificate", async () => {
  const result = await run({}, { variant: { url: "https://www.example.de/", error: "ERR_TLS_CERT_ALTNAME_INVALID" } });
  assert.equal(result.status, "warn");
});

test("skips when the variant does not exist", async () => {
  assert.equal((await run({})).status, "skip");
});
