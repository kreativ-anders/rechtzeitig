import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;
const sales = true;

test("passes with the model form and a pointer to the withdrawal function", async () => {
  assert.equal((await runCheck(here, "complete", { sales })).status, "pass");
});

test("warns for instructions from before 19 June 2026 without the pointer", async () => {
  // The model form's "Wenn Sie den Vertrag widerrufen wollen" is no pointer to the function.
  const result = await runCheck(here, "old", { sales });
  assert.equal(result.status, "warn");
  assert.equal(result.details.length, 1);
  assert.match(result.details[0], /withdrawal function/);
});

test("finds the instructions in the T&Cs and the model form behind a link", async () => {
  const result = await runCheck(here, "in-terms", { sales });
  assert.equal(result.status, "pass");
  assert.match(result.details.join("\n"), /in the terms: \/agb/);
});

test("warns without withdrawal instructions", async () => {
  assert.equal((await runCheck(here, "none", { sales })).status, "warn");
});
