import { test } from "node:test";
import assert from "node:assert/strict";
import { loadYaml } from "../../src/data.ts";
import { loadChecks } from "../../src/runner.ts";
import { SCORED, loadCases, runBenchmark, table } from "./run.ts";

const LIMITS = loadYaml<{ benchmark: { min_precision: number; min_recall: number; min_cases: number } }>("data/thresholds.yml").benchmark;

test("every scored rule exists and has a case that expects it and a clean case", async () => {
  const ids = (await loadChecks()).map((c) => c.id);
  const cases = loadCases();
  assert.ok(cases.length >= LIMITS.min_cases, `at least ${LIMITS.min_cases} cases`);
  for (const rule of SCORED) {
    assert.ok(ids.includes(rule), `${rule} is not a check`);
    assert.ok(cases.some((c) => c.expect.includes(rule)), `no case expects ${rule}`);
  }
  assert.ok(cases.some((c) => !c.expect.length), "no clean case");
});

test("the code checks reach the precision and recall of data/thresholds.yml on the benchmark", async (t) => {
  const { scores, errors } = await runBenchmark();
  t.diagnostic(`\n${table(scores)}`);
  assert.deepEqual(errors, []);
  for (const s of scores) {
    assert.ok(s.precision >= LIMITS.min_precision, `${s.rule}: precision ${s.precision.toFixed(2)} (${s.misses.join(", ")})`);
    assert.ok(s.recall >= LIMITS.min_recall, `${s.rule}: recall ${s.recall.toFixed(2)} (${s.misses.join(", ")})`);
  }
});
