// Every input of the action is documented: in docs/workflow.html and in the example workflow users copy.
// Every switch in src/rules.ts is an input, so "what runs when" never names something that cannot be set.
// action.yml, src/options.ts and the docs agree on names and defaults, and every input is either set in the
// example's with: block or named in FILE_ONLY, so adding an input forces that decision.

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

test("only the code scanning check gets the job's token, never the scan step", () => {
  const withToken = action.runs.steps.filter((s) => JSON.stringify(s.env ?? {}).includes("github.token")).map((s) => s.id);
  assert.deepEqual(withToken, ["sarif"]);
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

// ---------- the example workflow and this repository's workflow

/**
 * Inputs the example workflow does not set in its with: block, and why. The example names them in a comment
 * with their default ("repository" at the checkout step). A new input goes either into the with: block of
 * the example or here.
 */
const FILE_ONLY: Record<string, string> = {
  url: "each user sets their own site; the example shows it as a comment",
  repository: "follows the checkout step",
  "report-visibility": "the default auto keeps findings off public run pages",
  "sarif-upload": "the default auto uploads where GitHub allows it",
  modules: "the default runs all checks",
  "report-language": "the default follows language",
  "max-pages": "rarely changes",
  vulnerabilities: "data protection setting, on by default",
  "green-hosting": "data protection setting, on by default",
  "require-sandbox": "safety setting, should stay on",
};

type Workflow = {
  on: { schedule?: { cron: string }[]; workflow_dispatch?: { inputs?: Record<string, unknown> } | null };
  jobs: Record<string, { permissions?: Record<string, string>; steps: Step[] }>;
};
const isRechtzeitig = (s: Step) => /rechtzeitig@|^\.\/$/.test(s.uses ?? "");
const workflow = (path: string) => {
  const wf = loadYaml<Workflow>(path);
  const job = Object.values(wf.jobs).find((j) => j.steps.some(isRechtzeitig));
  assert.ok(job, `${path} has no rechtzeitig step`);
  const step = job.steps.find(isRechtzeitig)!;
  return { on: wf.on, permissions: job.permissions ?? {}, with: step.with ?? {} };
};
const example = workflow("examples/workflows/rechtzeitig.yml");
const own = workflow(".github/workflows/rechtzeitig.yml");

test("every input is set in the example's with: block or in FILE_ONLY", () => {
  const set = Object.keys(example.with);
  assert.deepEqual(inputs.filter((i) => !set.includes(i) && !(i in FILE_ONLY)), [], "set it in the example or add it to FILE_ONLY");
  assert.deepEqual(set.filter((i) => i in FILE_ONLY), [], "both set in the example and in FILE_ONLY");
  assert.deepEqual(Object.keys(FILE_ONLY).filter((i) => !inputs.includes(i)), [], "FILE_ONLY names an input that does not exist");
});

test("the example names each input it does not set with the default of action.yml", () => {
  const text = read("examples/workflows/rechtzeitig.yml");
  const differ = Object.keys(FILE_ONLY).flatMap((i) => {
    const comment = new RegExp(`^\\s*#\\s*${i}:\\s*(.*)$`, "m").exec(text)?.[1].replace(/^"(.*)"$/, "$1");
    const want = action.inputs[i].default ?? "";
    // url shows an example site, not the default.
    if (comment === undefined || i === "url" || isExpression(want)) return [];
    return comment === want ? [] : [`${i}: "${comment}" in the example, "${want}" in action.yml`];
  });
  assert.deepEqual(differ, []);
});

test("both workflows run on a schedule and by hand, without a Run workflow dialog", () => {
  for (const [name, wf] of [["example", example], ["own", own]] as const) {
    assert.ok(wf.on.schedule?.length, `${name}: no schedule`);
    assert.ok("workflow_dispatch" in wf.on, `${name}: no workflow_dispatch`);
    assert.equal(wf.on.workflow_dispatch?.inputs, undefined, `${name}: has a Run workflow dialog`);
    // Nothing reads inputs.*, which is empty on scheduled runs.
    assert.deepEqual(Object.entries(wf.with).filter(([, v]) => String(v).includes("inputs.")).map(([k]) => k), [], `${name}: uses inputs.*`);
  }
});

test("this repository's workflow has the same job permissions as the example", () => {
  assert.deepEqual(own.permissions, example.permissions);
  // The SARIF upload needs security-events: write, in private repositories also actions: read.
  assert.equal(example.permissions["security-events"], "write");
  assert.equal(example.permissions.actions, "read");
});
