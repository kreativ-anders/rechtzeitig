import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes for plain HTML", async () => {
  assert.equal((await runCheck(here, "static")).status, "pass");
});

test("warns for a single page app that renders everything in the browser", async () => {
  assert.equal((await runCheck(here, "spa")).status, "warn");
});
