import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;
const sales = true;

test("passes with VAT, shipping, base price and the 30-day lowest price", async () => {
  const result = await runCheck(here, "complete", { sales });
  assert.equal(result.status, "pass");
  assert.deepEqual(result.details, []);
});

test("warns for every missing notice, also for a price struck through with CSS", async () => {
  const result = await runCheck(here, "incomplete", { sales });
  assert.equal(result.status, "warn");
  assert.equal(result.details.length, 4);
  assert.ok(result.details.some((d) => d.includes("750 ml")));
  assert.ok(result.details.some((d) => d.includes("14,99 €")));
});

test("does not ask for the 30-day price next to a recommended retail price", async () => {
  const result = await runCheck(here, "rrp", { sales });
  assert.equal(result.status, "pass");
  assert.match(result.details.join("\n"), /recommended retail price/);
});

test("skips without prices next to a cart; the imprint's share capital does not count", async () => {
  assert.equal((await runCheck(here, "none", { sales })).status, "skip");
});
