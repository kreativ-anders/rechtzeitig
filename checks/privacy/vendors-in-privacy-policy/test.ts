import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes when the policy names Google Fonts", async () => {
  assert.equal((await runCheck(here, "named")).status, "pass");
});

test("warns when the policy does not name it", async () => {
  const result = await runCheck(here, "unnamed");
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, ["Google Fonts"]);
});

test("matches whole words, and names unknown services by their domain", async () => {
  // "Metadaten" is not "Meta"; "Cookies" is not "co" from shop.co.uk.
  const result = await runCheck(here, "partial-words");
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, ["Meta Pixel", "shop.co.uk"]);
});

test("skips without a privacy policy", async () => {
  assert.equal((await runCheck(here, "none")).status, "skip");
});
