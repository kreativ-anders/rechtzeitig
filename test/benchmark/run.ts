// Self-benchmark of the code checks: realistic outputs of coding agents for everyday prompts ("add login",
// "add Supabase", "write tests"), each labelled with the rules that must report it, plus reviewed counterparts that
// must stay clean. Every repository check runs on every case; precision and recall are scored for the rules in
// SCORED. test/benchmark/benchmark.test.ts fails below `benchmark` in data/thresholds.yml.
//
//   npm run benchmark            prints the table (Markdown)
//
// A case is test/benchmark/fixtures/<name>.yml: `prompt`, `expect` (rule paths that must report a finding, that is
// warn, fail or info) and `files` (path → content). `{{key:<length>:<seed>}}` in a file becomes a random-looking key
// at runtime, so no key-like string is committed.

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadYaml } from "../../src/data.ts";
import { loadChecks, runChecks } from "../../src/runner.ts";
import { randomKey, repoFromFiles } from "../helpers.ts";

const FIXTURES = new URL("./fixtures/", import.meta.url);

/** Rules the benchmark scores. The other repository checks run too, so a crash on these inputs shows up. */
export const SCORED = [
  "security/tls-verification-off",
  "security/debug-mode",
  "security/default-credentials",
  "security/example-env-values",
  "security/llm-key-in-browser",
  "security/service-key-in-client",
  "quality/hollow-tests",
  "quality/neutralized-ci",
  "quality/placeholder-code",
];

export interface Case {
  name: string;
  prompt: string;
  expect: string[];
  files: Record<string, string>;
}

export interface Score {
  rule: string;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number;
  recall: number;
  /** Cases that reported without being expected (fp) or were expected and stayed silent (fn). */
  misses: string[];
}

const fill = (text: string) => text.replace(/\{\{key:(\d+):(\d+)\}\}/g, (_, n, seed) => randomKey(Number(n), Number(seed)));

export function loadCases(): Case[] {
  return readdirSync(FIXTURES)
    .filter((f) => f.endsWith(".yml"))
    .sort()
    .map((f) => {
      const c = loadYaml<Omit<Case, "name">>(new URL(f, FIXTURES));
      return { ...c, name: f.replace(/\.yml$/, ""), files: Object.fromEntries(Object.entries(c.files).map(([p, t]) => [p, fill(t)])) };
    });
}

/** Rules of SCORED that reported a finding on the case, and every check that broke. */
export async function runCase(c: Case): Promise<{ flagged: string[]; errors: string[] }> {
  const checks = (await loadChecks()).filter((x) => x.check.repo);
  const outcomes = await runChecks(checks, { repo: await repoFromFiles(c.files) });
  return {
    flagged: outcomes.filter((o) => ["fail", "warn", "info"].includes(o.status) && SCORED.includes(o.id)).map((o) => o.id),
    errors: outcomes.filter((o) => o.status === "error").map((o) => `${o.id}: ${o.message}`),
  };
}

export async function runBenchmark(): Promise<{ cases: Case[]; scores: Score[]; errors: string[] }> {
  const cases = loadCases();
  const scores = new Map(SCORED.map((rule) => [rule, { rule, tp: 0, fp: 0, fn: 0, tn: 0, precision: 1, recall: 1, misses: [] as string[] }]));
  const errors: string[] = [];
  for (const c of cases) {
    const unknown = c.expect.filter((r) => !SCORED.includes(r));
    if (unknown.length) throw new Error(`${c.name}: expect names rules that are not scored: ${unknown.join(", ")}`);
    const { flagged, errors: broke } = await runCase(c);
    errors.push(...broke.map((e) => `${c.name}: ${e}`));
    for (const s of scores.values()) {
      const expected = c.expect.includes(s.rule);
      const got = flagged.includes(s.rule);
      if (expected && got) s.tp++;
      else if (got) (s.fp++, s.misses.push(`${c.name} (false positive)`));
      else if (expected) (s.fn++, s.misses.push(`${c.name} (missed)`));
      else s.tn++;
    }
  }
  for (const s of scores.values()) {
    s.precision = s.tp + s.fp ? s.tp / (s.tp + s.fp) : 1;
    s.recall = s.tp + s.fn ? s.tp / (s.tp + s.fn) : 1;
  }
  return { cases, scores: [...scores.values()], errors };
}

const pct = (x: number) => `${Math.round(x * 100)} %`;

export function table(scores: Score[]): string {
  return [
    "| Rule | TP | FP | FN | TN | Precision | Recall |",
    "|---|---|---|---|---|---|---|",
    ...scores.map((s) => `| ${s.rule} | ${s.tp} | ${s.fp} | ${s.fn} | ${s.tn} | ${pct(s.precision)} | ${pct(s.recall)} |`),
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { cases, scores, errors } = await runBenchmark();
  console.log(`${cases.length} cases, ${cases.filter((c) => !c.expect.length).length} of them clean\n`);
  console.log(table(scores));
  for (const s of scores) for (const m of s.misses) console.log(`- ${s.rule}: ${m}`);
  for (const e of errors) console.log(`- error: ${e}`);
}
