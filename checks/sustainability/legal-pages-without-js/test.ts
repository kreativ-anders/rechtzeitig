import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes for plain HTML", async () => {
  assert.equal((await runCheck(here, "static")).status, "pass");
});

test("fails when the links are added by JavaScript", async () => {
  const result = await runCheck(here, "js-links");
  assert.equal(result.status, "fail");
  assert.equal(result.details?.length, 2);
});

test("fails when the imprint text is rendered by JavaScript", async () => {
  const result = await runCheck(here, "js-content");
  assert.equal(result.status, "fail");
  assert.match(result.details?.[0] ?? "", /^Imprint: .* shows no text/);
});
