import { test } from "node:test";
import assert from "node:assert/strict";
import { runFake } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes when HTTP redirects to HTTPS", async () => {
  const result = await runFake(here, {}, { http: { status: 301, location: "https://example.de/" } });
  assert.equal(result.status, "pass");
});

test("passes when HTTP is not offered at all", async () => {
  assert.equal((await runFake(here, {}, { http: { error: "connection refused" } })).status, "pass");
});

test("fails when HTTP serves the page unencrypted", async () => {
  assert.equal((await runFake(here, {}, { http: { status: 200, location: "" } })).status, "fail");
});

test("fails for an http:// site", async () => {
  assert.equal((await runFake(here, { finalUrl: "http://example.de/" })).status, "fail");
});

test("skips when plain HTTP was not checked", async () => {
  assert.equal((await runFake(here, {})).status, "skip");
});
