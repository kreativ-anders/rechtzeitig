import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

const subscriptions = true;

test("passes with the wording from the law and a confirmation button", async () => {
  assert.equal((await runCheck(here, "exact", { subscriptions })).status, "pass");
});

test("warns on similar wording", async () => {
  assert.equal((await runCheck(here, "similar", { subscriptions })).status, "warn");
});

test("warns when the confirmation button is missing", async () => {
  const result = await runCheck(here, "no-confirm", { subscriptions });
  assert.equal(result.status, "warn");
  assert.match(result.details?.[0] ?? "", /jetzt kündigen/);
});

test("fails without a button", async () => {
  assert.equal((await runCheck(here, "missing", { subscriptions })).status, "fail");
});

test("skips for sites without subscriptions", async () => {
  assert.equal((await runCheck(here, "missing")).status, "skip");
});
