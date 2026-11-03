import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes when accept and reject sit side by side", async () => {
  assert.equal((await runCheck(here, "both")).status, "pass");
});

test("fails when only accept and settings are offered", async () => {
  assert.equal((await runCheck(here, "accept-only")).status, "fail");
});

test("finds a banner inside a shadow root", async () => {
  assert.equal((await runCheck(here, "shadow-accept-only")).status, "fail");
});

test("skips without a banner", async () => {
  assert.equal((await runCheck(here, "none")).status, "skip");
});
