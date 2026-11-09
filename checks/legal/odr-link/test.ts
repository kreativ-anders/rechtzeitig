import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeLink, runCheck, runFake } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes without the old link", async () => {
  assert.equal((await runCheck(here, "clean")).status, "pass");
});

test("warns for the old link in the imprint", async () => {
  const result = await runCheck(here, "outdated");
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, ["/impressum"]);
});

test("warns for the old link without its address in the text", async () => {
  const result = await runFake(here, { links: [fakeLink("Streitschlichtung", "https://ec.europa.eu/consumers/odr/")] });
  assert.equal(result.status, "warn");
});
