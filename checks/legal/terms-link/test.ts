import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;
const sales = true;

test("passes when the T&Cs are linked and have content", async () => {
  assert.equal((await runCheck(here, "good", { sales })).status, "pass");
});

test("warns without a link, since T&Cs are optional", async () => {
  assert.equal((await runCheck(here, "missing", { sales })).status, "warn");
});

test("fails when the linked T&Cs return 404", async () => {
  const result = await runCheck(here, "broken", { sales });
  assert.equal(result.status, "fail");
  assert.match(result.message, /404/);
});
