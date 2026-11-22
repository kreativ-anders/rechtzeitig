import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck, runFake } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes when the start page declares its language", async () => {
  assert.equal((await runCheck(here, "german")).status, "pass");
  assert.equal((await runFake(here, { lang: " EN-gb " })).status, "pass");
});

// The scan reads the language from the German version the start page names (hreflang).
test("warns without lang", async () => {
  assert.equal((await runCheck(here, "missing")).status, "warn");
});
