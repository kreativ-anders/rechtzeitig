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

test("gives info when the button cannot be followed to the confirmation page", async () => {
  const result = await runCheck(here, "button-only", { subscriptions });
  assert.equal(result.status, "info");
  assert.match(result.details?.[0] ?? "", /a button without a link/);
});

test("fails without a button", async () => {
  assert.equal((await runCheck(here, "missing", { subscriptions })).status, "fail");
});

test("warns when the cancellation page shows only a login form", async () => {
  // Trimmed from a real login page: user id, password, "Anmelden", and a search box in the header.
  const result = await runCheck(here, "login-wall", { subscriptions });
  assert.equal(result.status, "warn");
  assert.equal(result.raw.details?.[0]?.key, "login_wall");
});

test("allows login data as fields of the cancellation form", async () => {
  // Trimmed from netflix.com/cancelplan: login id and password in the form whose button says "Kündigung abschließen".
  const result = await runCheck(here, "login-in-form", { subscriptions });
  assert.equal(result.status, "warn");
  assert.equal(result.raw.details?.[0]?.key, "no_confirm");
});

test("warns when the button leads to an app store", async () => {
  const result = await runCheck(here, "app-store", { subscriptions });
  assert.equal(result.status, "warn");
  assert.equal(result.raw.details?.[0]?.key, "app_store");
});

test("accepts the English wording of the Digital Fairness Act proposal", async () => {
  assert.equal((await runCheck(here, "dfa-english", { subscriptions })).status, "pass");
});

