// Every input of the action is documented: in docs/workflow.html and in the example workflow users copy.
// Every switch in src/rules.ts is an input, so "what runs when" never names something that cannot be set.
// action.yml, src/options.ts and the docs agree on names and defaults, and every input is either offered
// in the Run workflow dialog or named in FILE_ONLY, so adding an input forces that decision.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadYaml } from "./data.ts";
import { SWITCHES } from "./rules.ts";
import { CLI_OPTIONS } from "./options.ts";

type Step = { id?: string; uses?: string; env?: Record<string, string>; run?: string; with?: Record<string, unknown> };
const action = loadYaml<{ inputs: Record<string, { default?: string }>; runs: { steps: Step[] } }>("action.yml");
const inputs = Object.keys(action.inputs);
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const scanStep = action.runs.steps.find((s) => s.id === "scan")!;
const scanRun = scanStep.run ?? "";
const isExpression = (v: string) => v.includes("${{");
const options = CLI_OPTIONS as Record<string, { default?: string }>;
/** The command line option an environment variable of the scan step is passed to. */
const flagOf = (env: string) => new RegExp(`--([a-z-]+) "\\$${env}"`).exec(scanRun)?.[1];
/** The input an environment variable of the scan step comes from. */
const inputOf = (value: string) => /inputs\.([a-z-]+)/.exec(value)?.[1];

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

// ---------- action.yml, src/options.ts and the docs agree

test("every input is used by a step of the action", () => {
  const text = read("action.yml");
  assert.deepEqual(inputs.filter((i) => !text.includes(`inputs.${i}`)), []);
});

test("every input that reaches the scan becomes an option or an environment variable src/main.ts reads", () => {
  const main = read("src/main.ts");
  const broken = Object.entries(scanStep.env ?? {}).flatMap(([env, value]) => {
    const input = inputOf(value);
    if (!input) return [];
    const flag = flagOf(env);
    if (flag) return flag in options ? [] : [`${input}: --${flag} is not in src/options.ts`];
    return main.includes(`process.env.${env}`) ? [] : [`${input}: ${env} is neither an option nor read by src/main.ts`];
  });
  assert.deepEqual(broken, []);
});

test("the action passes every command line option", () => {
  assert.deepEqual(Object.keys(options).filter((o) => !scanRun.includes(`--${o} `)), []);
});

test("an input and its command line option have the same default", () => {
  const differ = Object.entries(scanStep.env ?? {}).flatMap(([env, value]) => {
    const input = /^\$\{\{ inputs\.([a-z-]+) \}\}$/.exec(value)?.[1];
    const flag = flagOf(env);
    const have = flag && options[flag]?.default;
    const want = input && action.inputs[input].default;
    if (have === undefined || !want || isExpression(want)) return [];
    return have === want ? [] : [`${input}: action.yml "${want}", src/options.ts "${have}"`];
  });
  assert.deepEqual(differ, []);
});

test("docs/workflow.html shows the default of action.yml", () => {
  const page = read("docs/workflow.html");
  // Empty and computed defaults are described in words there ("empty", "all", "workspace").
  const differ = inputs.filter((i) => {
    const want = action.inputs[i].default ?? "";
    return want && !isExpression(want) && !page.includes(`<tr><td><code>${i}</code></td><td><code>${want}</code></td>`);
  });
  assert.deepEqual(differ, []);
});

// ---------- the Run workflow dialog

/**
 * Inputs set in the workflow file, not in the Run workflow dialog, and why. A new input goes either into
 * the dialog of the example workflow or here.
 */
const FILE_ONLY: Record<string, string> = {
  repository: "follows the checkout step",
  "ipinfo-token": "a secret",
  modules: "rarely changes between runs",
  "report-language": "rarely changes between runs",
  "max-pages": "rarely changes between runs",
  vulnerabilities: "data protection setting of the repository, not of a run",
  "green-hosting": "data protection setting of the repository, not of a run",
  "require-sandbox": "safety setting, should not be one click away",
  "retention-days": "setting of the repository, not of a run",
};

type Workflow = { on: { workflow_dispatch?: { inputs?: Record<string, { default?: unknown }> } }; jobs: Record<string, { steps: Step[] }> };
const dialog = (path: string) => {
  const wf = loadYaml<Workflow>(path);
  const step = Object.values(wf.jobs).flatMap((j) => j.steps).find((s) => /rechtzeitig@|^\.\/$/.test(s.uses ?? ""));
  assert.ok(step, `${path} has no rechtzeitig step`);
  return { inputs: wf.on.workflow_dispatch?.inputs ?? {}, with: step.with ?? {} };
};
const example = dialog("examples/workflows/rechtzeitig.yml");
const own = dialog(".github/workflows/rechtzeitig.yml");

test("every input is in the Run workflow dialog of the example or in FILE_ONLY", () => {
  const offered = Object.keys(example.inputs);
  assert.deepEqual(inputs.filter((i) => !offered.includes(i) && !(i in FILE_ONLY)), [], "add it to the dialog or to FILE_ONLY");
  assert.deepEqual(offered.filter((i) => i in FILE_ONLY), [], "both in the dialog and in FILE_ONLY");
  assert.deepEqual(Object.keys(FILE_ONLY).filter((i) => !inputs.includes(i)), [], "FILE_ONLY names an input that does not exist");
});

test("the dialog passes each choice to the action, with the action's default", () => {
  for (const [name, spec] of Object.entries(example.inputs)) {
    assert.equal(example.with[name], `\${{ inputs.${name} }}`, `${name} is not passed to the action`);
    const want = action.inputs[name]?.default;
    if (spec.default !== undefined && want !== undefined) assert.equal(String(spec.default), want, `${name}: default in the dialog`);
  }
});

test("this repository's workflow offers the same dialog as the example", () => {
  assert.deepEqual(Object.keys(own.inputs), Object.keys(example.inputs));
  for (const name of Object.keys(own.inputs)) assert.equal(own.with[name], `\${{ inputs.${name} }}`, `${name} is not passed`);
});
