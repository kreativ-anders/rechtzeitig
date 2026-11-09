import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck, runFake } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes when lang matches the scan language", async () => {
  assert.equal((await runCheck(here, "german")).status, "pass");
});

test("warns without lang", async () => {
  assert.equal((await runCheck(here, "missing")).status, "warn");
});

test("warns when the scan used another language", async () => {
  const result = await runCheck(here, "english");
  assert.equal(result.status, "warn");
  assert.match(result.message, /lang="en"/);
});

test("compares only the primary language, so de-AT counts as German", async () => {
  assert.equal((await runFake(here, { lang: "de-AT" })).status, "pass");
  assert.equal((await runFake(here, { lang: " EN-gb " })).status, "warn");
});
