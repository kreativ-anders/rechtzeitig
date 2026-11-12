import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes when the imprint is linked and has content", async () => {
  assert.equal((await runCheck(here, "good")).status, "pass");
});

test("finds an English legal notice", async () => {
  assert.equal((await runCheck(here, "english", { language: "en" })).status, "pass");
});

test("fails without a link", async () => {
  assert.equal((await runCheck(here, "missing")).status, "fail");
});

test("fails when the page is empty", async () => {
  assert.equal((await runCheck(here, "empty")).status, "fail");
});

test("fails when the page returns 404", async () => {
  const result = await runCheck(here, "broken");
  assert.equal(result.status, "fail");
  assert.match(result.message, /404/);
});

// Issue #52: an English scan of a German page finds the German imprint link.
test("finds a German imprint link in an English scan", async () => {
  assert.equal((await runCheck(here, "other-language", { language: "en" })).status, "pass");
});
