import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes when the privacy policy is linked and has content", async () => {
  assert.equal((await runCheck(here, "good")).status, "pass");
});

test("finds an English privacy policy", async () => {
  assert.equal((await runCheck(here, "english", { language: "en" })).status, "pass");
});

test("fails without a link", async () => {
  assert.equal((await runCheck(here, "missing")).status, "fail");
});
