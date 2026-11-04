import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;
const sales = true;

test("passes with the wording from the law on the checkout page", async () => {
  const result = await runCheck(here, "good", { sales });
  assert.equal(result.status, "pass");
  assert.match(result.details.join("\n"), /\/kasse/);
});

test("fails for \"Bestellen\" on the checkout page", async () => {
  assert.equal((await runCheck(here, "wrong", { sales })).status, "fail");
});

test("warns for \"Weiter\" on the checkout page, which may be an earlier step", async () => {
  assert.equal((await runCheck(here, "generic", { sales })).status, "warn");
});

test("warns for \"Bestellung absenden\" in an order form outside a checkout", async () => {
  assert.equal((await runCheck(here, "form", { sales })).status, "warn");
});

test("skips without a checkout: a product button and a contact form do not count", async () => {
  assert.equal((await runCheck(here, "none", { sales })).status, "skip");
});
