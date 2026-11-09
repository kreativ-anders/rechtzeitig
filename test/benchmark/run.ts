// Benchmark of the code checks in two sets, scored separately:
//
//   real/       excerpts of public repositories under a permissive license (AI-built apps, starter templates,
//               maintained reference projects), labelled by reading the code before the checks ran.
//   synthetic/  code as coding agents write it for everyday prompts ("add login", "add Supabase"), written
//               together with the patterns, so its score is an upper bound, not evidence.
//
// Every repository check runs on every case; precision and recall are scored for the rules in SCORED.
// test/benchmark/benchmark.test.ts fails below `benchmark` in data/thresholds.yml, for each set.
//
//   npm run benchmark            prints both tables (Markdown)
//
// A case is test/benchmark/fixtures/<set>/<name>.yml: `expect` (rule paths that must report a finding, that is
// warn, fail or info) and `files` (path → content). A synthetic case has `prompt` (what the agent was asked).
// A real case has `source` (repo URL, commit SHA, license, copyright holder, original paths) and `label` (why the
// case expects what it expects). `{{key:<length>:<seed>}}` in a file becomes a random-looking key at runtime, so no
// key-like string is committed; real credentials in a source are replaced by it.

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadYaml } from "../../src/data.ts";
import { loadChecks, runChecks } from "../../src/runner.ts";
import { randomKey, repoFromFiles } from "../helpers.ts";

const FIXTURES = new URL("./fixtures/", import.meta.url);

export const SETS = ["real", "synthetic"] as const;
export type CaseSet = (typeof SETS)[number];

/** Licenses a real case may come from: they allow copying an excerpt into this Apache-2.0 repository. */
export const LICENSES = ["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "CC0-1.0", "0BSD", "Unlicense"];

/** Rules the benchmark scores. The other repository checks run too, so a crash on these inputs shows up. */
export const SCORED = [
  "security/tls-verification-off",
  "security/debug-mode",
  "security/default-credentials",
  "security/example-env-values",
  "security/llm-key-in-browser",
  "security/service-key-in-client",
  "security/agent-permissions",
  "quality/hollow-tests",
  "quality/neutralized-ci",
  "quality/placeholder-code",
];

export interface Source {
  /** https://github.com/<owner>/<repo> */
  repo: string;
  /** Full commit SHA the excerpt was taken from. */
  commit: string;
  /** SPDX id of the repository's license, one of LICENSES. */
  license: string;
  /** Copyright holder as the license file names it, for NOTICE. */
  copyright: string;
  /** Original path of each file of the case, with the lines taken when not the whole file. */
  paths: Record<string, string>;
}

export interface Case {
  name: string;
  set: CaseSet;
  prompt?: string;
  source?: Source;
  label?: string;
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

export function loadCases(sets: readonly CaseSet[] = SETS): Case[] {
  return sets.flatMap((set) => {
    const dir = new URL(`${set}/`, FIXTURES);
    return readdirSync(dir)
      .filter((f) => f.endsWith(".yml"))
      .sort()
      .map((f) => {
        const c = loadYaml<Omit<Case, "name" | "set">>(new URL(f, dir));
        return { ...c, name: f.replace(/\.yml$/, ""), set, files: Object.fromEntries(Object.entries(c.files).map(([p, t]) => [p, fill(t)])) };
      });
  });
}

/** Problems with the metadata of a case: a real case needs a full source under an allowed license and a label. */
export function caseProblems(c: Case): string[] {
  const out: string[] = [];
  const unknown = c.expect.filter((r) => !SCORED.includes(r));
  if (unknown.length) out.push(`expect names rules that are not scored: ${unknown.join(", ")}`);
  if (c.set === "synthetic" && !c.prompt) out.push("a synthetic case needs `prompt`");
  if (c.set !== "real") return out;
  const s = c.source;
  if (!s) return [...out, "a real case needs `source`"];
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(s.repo ?? "")) out.push("source.repo is not a GitHub repository URL");
  if (!/^[0-9a-f]{40}$/.test(s.commit ?? "")) out.push("source.commit is not a full commit SHA");
  if (!LICENSES.includes(s.license)) out.push(`source.license ${s.license} is not one of ${LICENSES.join(", ")}`);
  if (!s.copyright) out.push("source.copyright is missing");
  const files = Object.keys(c.files);
  if (!s.paths || files.some((f) => !(f in s.paths))) out.push("source.paths must name the original of every file");
  if (!c.label || c.label.length < 40) out.push("`label` must say why the case expects what it expects");
  return out;
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

function score(cases: Case[], flagged: Map<string, string[]>): Score[] {
  return SCORED.map((rule) => {
    const s: Score = { rule, tp: 0, fp: 0, fn: 0, tn: 0, precision: 1, recall: 1, misses: [] };
    for (const c of cases) {
      const expected = c.expect.includes(rule);
      const got = flagged.get(`${c.set}/${c.name}`)!.includes(rule);
      if (expected && got) s.tp++;
      else if (got) (s.fp++, s.misses.push(`${c.name} (false positive)`));
      else if (expected) (s.fn++, s.misses.push(`${c.name} (missed)`));
      else s.tn++;
    }
    s.precision = s.tp + s.fp ? s.tp / (s.tp + s.fp) : 1;
    s.recall = s.tp + s.fn ? s.tp / (s.tp + s.fn) : 1;
    return s;
  });
}

export async function runBenchmark(): Promise<{ cases: Case[]; scores: Record<CaseSet, Score[]>; errors: string[] }> {
  const cases = loadCases();
  const flagged = new Map<string, string[]>();
  const errors: string[] = [];
  for (const c of cases) {
    const problems = caseProblems(c);
    if (problems.length) throw new Error(`${c.set}/${c.name}: ${problems.join("; ")}`);
    const run = await runCase(c);
    flagged.set(`${c.set}/${c.name}`, run.flagged);
    errors.push(...run.errors.map((e) => `${c.set}/${c.name}: ${e}`));
  }
  const scores = Object.fromEntries(SETS.map((set) => [set, score(cases.filter((c) => c.set === set), flagged)])) as Record<CaseSet, Score[]>;
  return { cases, scores, errors };
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
  for (const set of SETS) {
    const of = cases.filter((c) => c.set === set);
    console.log(`\n## ${set}: ${of.length} cases, ${of.filter((c) => !c.expect.length).length} of them clean\n`);
    console.log(table(scores[set]));
    for (const s of scores[set]) for (const m of s.misses) console.log(`- ${s.rule}: ${m}`);
  }
  for (const e of errors) console.log(`- error: ${e}`);
}
