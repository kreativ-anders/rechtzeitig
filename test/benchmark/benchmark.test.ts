import { test } from "node:test";
import assert from "node:assert/strict";
import { loadYaml } from "../../src/data.ts";
import { loadChecks } from "../../src/runner.ts";
import { SCORED, SETS, caseProblems, loadCases, runBenchmark, table, type Score } from "./run.ts";

interface Exception {
  min_precision?: number;
  min_recall?: number;
  reason: string;
}
const LIMITS = loadYaml<{
  benchmark: { min_precision: number; min_recall: number; min_cases: number; min_real_cases: number; real_exceptions?: Record<string, Exception> | null };
}>("data/thresholds.yml").benchmark;
const EXCEPTIONS = LIMITS.real_exceptions ?? {};

test("every case has valid metadata; every scored rule exists and has real and synthetic cases that expect it", async () => {
  const ids = (await loadChecks()).map((c) => c.id);
  const cases = loadCases();
  for (const c of cases) assert.deepEqual(caseProblems(c), [], `${c.set}/${c.name}`);
  const real = cases.filter((c) => c.set === "real");
  const synthetic = cases.filter((c) => c.set === "synthetic");
  assert.ok(real.length >= LIMITS.min_real_cases, `at least ${LIMITS.min_real_cases} real cases, found ${real.length}`);
  assert.ok(synthetic.length >= LIMITS.min_cases, `at least ${LIMITS.min_cases} synthetic cases`);
  for (const rule of SCORED) {
    assert.ok(ids.includes(rule), `${rule} is not a check`);
    assert.ok(real.some((c) => c.expect.includes(rule)), `no real case expects ${rule}`);
  }
  for (const set of [real, synthetic]) assert.ok(set.some((c) => !c.expect.length), "no clean case");
});

test("every exception of the real set names a scored rule, gives a reason and is still needed", async () => {
  const { scores } = await runBenchmark();
  for (const [rule, e] of Object.entries(EXCEPTIONS)) {
    assert.ok(SCORED.includes(rule), `${rule} is not scored`);
    assert.ok(e.reason?.length > 20, `${rule}: an exception needs a reason`);
    const s = scores.real.find((x) => x.rule === rule)!;
    const needed = (e.min_precision !== undefined && s.precision < LIMITS.min_precision) || (e.min_recall !== undefined && s.recall < LIMITS.min_recall);
    assert.ok(needed, `${rule} reaches the minimums on the real set again: remove its exception`);
  }
});

const check = (s: Score, minPrecision: number, minRecall: number, set: string) => {
  assert.ok(s.precision >= minPrecision, `${set} ${s.rule}: precision ${s.precision.toFixed(2)} (${s.misses.join(", ")})`);
  assert.ok(s.recall >= minRecall, `${set} ${s.rule}: recall ${s.recall.toFixed(2)} (${s.misses.join(", ")})`);
};

test("the code checks reach the precision and recall of data/thresholds.yml on the real and the synthetic set", async (t) => {
  const { scores, errors } = await runBenchmark();
  for (const set of SETS) t.diagnostic(`\n${set}\n${table(scores[set])}`);
  assert.deepEqual(errors, []);
  for (const s of scores.synthetic) check(s, LIMITS.min_precision, LIMITS.min_recall, "synthetic");
  for (const s of scores.real) {
    const e = EXCEPTIONS[s.rule];
    check(s, e?.min_precision ?? LIMITS.min_precision, e?.min_recall ?? LIMITS.min_recall, "real");
  }
});
