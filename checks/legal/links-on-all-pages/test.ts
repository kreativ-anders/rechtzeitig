import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck, runFake } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes when every page has both links", async () => {
  assert.equal((await runCheck(here, "good")).status, "pass");
});

test("warns and names the page without links", async () => {
  const result = await runCheck(here, "gap");
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, ["/ueber-uns: no link to the imprint or privacy policy"]);
});

test("gives info when only the start page was read", async () => {
  assert.equal((await runFake(here)).status, "info");
});
