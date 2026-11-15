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

test("matches similar wording on the link text, not the URL", async () => {
  // "/widerruf" in the URL, but the link says "Widerrufsbelehrung".
  assert.equal((await runCheck(here, "path-only", { sales })).status, "fail");
});

test("warns when the withdrawal page shows only a login form", async () => {
  const result = await runCheck(here, "login-wall", { sales });
  assert.equal(result.status, "warn");
  assert.equal(result.raw.details?.[0]?.key, "login_wall");
});

test("warns when the withdrawal button leads to an app store", async () => {
  const result = await runCheck(here, "app-store", { sales });
  assert.equal(result.status, "warn");
  assert.equal(result.raw.details?.[0]?.key, "app_store");
});

