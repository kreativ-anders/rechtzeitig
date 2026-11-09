import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck, runFake } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes when optional categories start unticked", async () => {
  assert.equal((await runCheck(here, "unticked")).status, "pass");
});

test("fails when statistics is ticked by default", async () => {
  const result = await runCheck(here, "ticked");
  assert.equal(result.status, "fail");
  assert.deepEqual(result.details, ["Statistik"]);
});

test("skips without optional categories; a ticked newsletter box is no consent category", async () => {
  const result = await runFake(here, { checkboxes: [{ label: "Newsletter abonnieren", checked: true, disabled: false }] });
  assert.equal(result.status, "skip");
});

test("a ticked box that cannot be changed is not preselected consent", async () => {
  const result = await runFake(here, { checkboxes: [{ label: "Notwendig", checked: true, disabled: true }, { label: "Statistik", checked: true, disabled: true }] });
  assert.equal(result.status, "pass");
});
