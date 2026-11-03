import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;
const sales = true;

test("passes with the wording from the law and a confirmation button", async () => {
  assert.equal((await runCheck(here, "exact", { sales })).status, "pass");
});

test("warns on similar wording", async () => {
  assert.equal((await runCheck(here, "similar", { sales })).status, "warn");
});

test("does not count the withdrawal instructions as a function", async () => {
  assert.equal((await runCheck(here, "instructions-only", { sales })).status, "fail");
});

test("skips when nothing is sold", async () => {
  assert.equal((await runCheck(here, "exact")).status, "skip");
});
