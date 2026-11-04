// Every input of the action is documented: in docs/workflow.html and in the example workflow users copy.
// Every switch in src/rules.ts is an input, so "what runs when" never names something that cannot be set.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadYaml } from "./data.ts";
import { SWITCHES } from "./rules.ts";

const inputs = Object.keys(loadYaml<{ inputs: Record<string, unknown> }>("action.yml").inputs);
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("docs/workflow.html lists every input", () => {
  const page = read("docs/workflow.html");
  assert.deepEqual(inputs.filter((i) => !page.includes(`<td><code>${i}</code></td>`)), []);
});

test("the example workflow sets or names every input", () => {
  const example = read("examples/workflows/rechtzeitig.yml");
  // "repository" defaults to the checkout; the example explains it at the checkout step.
  const missing = inputs.filter((i) => i !== "repository" && !new RegExp(`^\\s*(#\\s*)?${i}:`, "m").test(example));
  assert.deepEqual(missing, []);
});

test("every switch is an input of the action", () => {
  assert.deepEqual(Object.keys(SWITCHES).filter((s) => !inputs.includes(s)), []);
});
