import { test } from "node:test";
import assert from "node:assert/strict";
import { runRepoCheck, TOO_LARGE } from "../../../test/helpers.ts";

const here = import.meta.dirname;
const pkg = JSON.stringify({ dependencies: { stripe: "^18.0.0" } });
const checkout = "await stripe.checkout.sessions.create({\n  mode: 'subscription',\n  subscription_data: { trial_period_days: 14 },\n});\n";

test("gives info for a trial and a plan without a reminder, at the line that creates them", async () => {
  const result = await runRepoCheck(here, { "package.json": pkg, "src/checkout.ts": checkout });
  assert.equal(result.status, "info");
  assert.deepEqual(result.raw.details?.map((d) => [d.key, d.line]), [["trial_no_reminder", 3], ["renewal_no_reminder", 2]]);
  assert.match(result.details[0], /Stripe/);
});

test("passes when the webhook handles the events before trial end and renewal", async () => {
  const hook = "switch (event.type) {\n  case 'customer.subscription.trial_will_end': remind(); break;\n  case 'invoice.upcoming': remind(); break;\n}\n";
  const result = await runRepoCheck(here, { "package.json": pkg, "src/checkout.ts": checkout, "src/webhook.ts": hook });
  assert.equal(result.status, "pass");
});

test("passes with a provider but no trial or plan in the code", async () => {
  const result = await runRepoCheck(here, { "package.json": pkg, "src/pay.ts": "await stripe.paymentIntents.create({ amount: 100 });\n" });
  assert.equal(result.status, "pass");
  assert.match(result.message, /No free trial/);
});

test("skips without a payment provider", async () => {
  assert.equal((await runRepoCheck(here, { "src/checkout.ts": checkout })).status, "skip");
});

// Evidence gap: a webhook file that could not be read may hold the handler.
test("gives info instead of no finding when a code file could not be read", async () => {
  const result = await runRepoCheck(here, { "package.json": pkg, "src/pay.ts": "export {};\n", "src/webhook.ts": TOO_LARGE });
  assert.equal(result.status, "info");
  assert.match(result.message, /could not be read/);
});
